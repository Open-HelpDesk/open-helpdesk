/**
 * Taking a workspace's history out again.
 *
 * The counterpart of @openhelpdesk/import, and the thing that makes "you are
 * never locked in" true on the hosted version rather than only for people who
 * self-host and can run pg_dump.
 *
 * NDJSON, one record per line, because an export is read by a machine and can
 * be enormous: a line-oriented format streams out of Postgres and into another
 * product without either side holding the whole history in memory. The first
 * line is a manifest describing what follows.
 *
 * Deliberately *not* a database dump: it carries the business record — tickets,
 * conversations, people, organisations — not our schema, our internal ids or our
 * migration history. Someone reading this file should be able to rebuild their
 * support history somewhere else without knowing anything about us.
 */
import {
  attachments,
  contactOrganizations,
  contacts,
  db,
  organizations,
  tenants,
  ticketMessages,
  tickets,
  users,
} from "@openhelpdesk/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";

/** Rows fetched per query. Keeps memory flat whatever the workspace's size. */
const PAGE = 500;

export const EXPORT_VERSION = 1;

export type ExportCounts = {
  organizations: number;
  contacts: number;
  tickets: number;
  messages: number;
  attachments: number;
};

function line(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/**
 * Yields the export as NDJSON chunks.
 *
 * A generator rather than a string: the caller pipes it straight into an HTTP
 * response, so a 200 000-ticket workspace never materialises anywhere.
 */
export async function* exportWorkspace(tenantId: string): AsyncGenerator<string> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error("unknown workspace");

  yield line({
    type: "manifest",
    version: EXPORT_VERSION,
    product: "open-helpdesk",
    workspace: { slug: tenant.slug, name: tenant.name, locale: tenant.locale },
    generated_at: new Date().toISOString(),
    // Said plainly rather than discovered by whoever reads the file: the bytes
    // of attachments are not in here, only their index.
    notes:
      "One JSON object per line. Attachment files are listed, not embedded; " +
      "download them from the URLs in each attachment record while the workspace is open.",
  });

  /* ---------- Organisations ---------- */
  let cursor = "";
  for (;;) {
    const rows = await db
      .select()
      .from(organizations)
      .where(
        cursor
          ? and(eq(organizations.tenantId, tenantId), gt(organizations.id, cursor))
          : eq(organizations.tenantId, tenantId),
      )
      .orderBy(asc(organizations.id))
      .limit(PAGE);
    if (rows.length === 0) break;
    for (const row of rows) {
      yield line({
        type: "organization",
        id: row.id,
        name: row.name,
        email_domains: row.emailDomains,
        notes: row.notes,
        custom_fields: row.customFields,
        created_at: row.createdAt.toISOString(),
      });
    }
    cursor = rows.at(-1)!.id;
    if (rows.length < PAGE) break;
  }

  /* ---------- People ---------- */
  const memberships = new Map<string, string[]>();
  for (const link of await db
    .select()
    .from(contactOrganizations)
    .where(eq(contactOrganizations.tenantId, tenantId))) {
    const list = memberships.get(link.contactId) ?? [];
    list.push(link.organizationId);
    memberships.set(link.contactId, list);
  }

  cursor = "";
  for (;;) {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        cursor
          ? and(eq(contacts.tenantId, tenantId), gt(contacts.id, cursor))
          : eq(contacts.tenantId, tenantId),
      )
      .orderBy(asc(contacts.id))
      .limit(PAGE);
    if (rows.length === 0) break;
    for (const row of rows) {
      yield line({
        type: "contact",
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        locale: row.locale,
        blocked: row.blocked,
        custom_fields: row.customFields,
        organization_ids: memberships.get(row.id) ?? [],
        created_at: row.createdAt.toISOString(),
      });
    }
    cursor = rows.at(-1)!.id;
    if (rows.length < PAGE) break;
  }

  // Agents are exported too: without them, "assigned to" in every ticket points
  // at nothing, and a thread loses the name of whoever answered.
  for (const row of await db.select().from(users).where(eq(users.tenantId, tenantId))) {
    yield line({
      type: "agent",
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      created_at: row.createdAt.toISOString(),
    });
  }

  /* ---------- Tickets, their messages, their files ---------- */
  const filesByMessage = new Map<string, (typeof attachments.$inferSelect)[]>();
  for (const file of await db
    .select()
    .from(attachments)
    .where(eq(attachments.tenantId, tenantId))) {
    if (!file.messageId) continue;
    const list = filesByMessage.get(file.messageId) ?? [];
    list.push(file);
    filesByMessage.set(file.messageId, list);
  }

  let number = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), gt(tickets.number, number)))
      .orderBy(asc(tickets.number))
      .limit(PAGE);
    if (rows.length === 0) break;

    for (const ticket of rows) {
      yield line({
        type: "ticket",
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        channel: ticket.channel,
        ticket_type: ticket.type,
        requester_id: ticket.requesterId,
        organization_id: ticket.organizationId,
        assignee_id: ticket.assigneeId,
        team_id: ticket.teamId,
        tags: ticket.tags,
        custom_fields: ticket.customFields,
        first_replied_at: ticket.firstRepliedAt?.toISOString() ?? null,
        resolved_at: ticket.resolvedAt?.toISOString() ?? null,
        closed_at: ticket.closedAt?.toISOString() ?? null,
        merged_into_id: ticket.mergedIntoId,
        imported_from: ticket.importSource
          ? { source: ticket.importSource, id: ticket.importedId }
          : null,
        created_at: ticket.createdAt.toISOString(),
        updated_at: ticket.updatedAt.toISOString(),
      });

      const messages = await db
        .select()
        .from(ticketMessages)
        .where(eq(ticketMessages.ticketId, ticket.id))
        .orderBy(asc(ticketMessages.createdAt));
      for (const message of messages) {
        yield line({
          type: "message",
          id: message.id,
          ticket_id: ticket.id,
          ticket_number: ticket.number,
          kind: message.kind,
          author_type: message.authorType,
          author_id: message.authorId,
          body_text: message.bodyText,
          body_html: message.bodyHtml,
          source: message.source,
          created_at: message.createdAt.toISOString(),
        });
        for (const file of filesByMessage.get(message.id) ?? []) {
          yield line({
            type: "attachment",
            id: file.id,
            message_id: message.id,
            ticket_number: ticket.number,
            filename: file.filename,
            content_type: file.contentType,
            size_bytes: file.sizeBytes,
            // The route an authenticated agent can fetch the file from.
            url: `/api/attachments/${file.id}`,
            created_at: file.createdAt.toISOString(),
          });
        }
      }
    }

    number = rows.at(-1)!.number;
    if (rows.length < PAGE) break;
  }
}

/**
 * Row counts, for showing what an export will contain before running it.
 *
 * Counted in Postgres rather than by loading ids: the whole point of this
 * screen is workspaces large enough to worry about, and fetching two hundred
 * thousand uuids to call `.length` on them would be the one query that makes
 * the page slow.
 */
export async function exportCounts(tenantId: string): Promise<ExportCounts> {
  const total = sql<number>`count(*)::int`;
  const [orgs, people, ticketRows, messageRows, fileRows] = await Promise.all([
    db.select({ n: total }).from(organizations).where(eq(organizations.tenantId, tenantId)),
    db.select({ n: total }).from(contacts).where(eq(contacts.tenantId, tenantId)),
    db.select({ n: total }).from(tickets).where(eq(tickets.tenantId, tenantId)),
    db.select({ n: total }).from(ticketMessages).where(eq(ticketMessages.tenantId, tenantId)),
    db.select({ n: total }).from(attachments).where(eq(attachments.tenantId, tenantId)),
  ]);
  return {
    organizations: orgs[0]?.n ?? 0,
    contacts: people[0]?.n ?? 0,
    tickets: ticketRows[0]?.n ?? 0,
    messages: messageRows[0]?.n ?? 0,
    attachments: fileRows[0]?.n ?? 0,
  };
}
