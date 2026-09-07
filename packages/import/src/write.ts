/**
 * Writes a SourceExport into the product's tables.
 *
 * This is the whole reason the import is not a loop over the public API:
 *
 * - it keeps the original ticket numbers, which customers quote in emails;
 * - it keeps the real dates — created, first replied, resolved — instead of
 *   stamping a decade of history with today;
 * - it attributes each message to its actual author, so a customer reply stays
 *   a customer reply;
 * - and above all it does NOT call onTicketCreated(), so importing thirty
 *   thousand closed tickets sends zero acknowledgement emails and starts zero
 *   SLA clocks. Through the API it would do both, to real people.
 *
 * Idempotent by (tenant, import_source, imported_id): a run that dies halfway
 * can be relaunched, and rows already written are recognised rather than
 * duplicated. That pair carries a partial unique index (migration 0021).
 */
import {
  contactOrganizations,
  contacts,
  db,
  organizations,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fetchAndStoreAttachments, type FetchOptions } from "./attachments";
import {
  emptyReport,
  type Anomaly,
  type ImportReport,
  type ImportSource,
  type SourceExport,
  type SourceMessage,
  type SourceTicket,
} from "./types";

/**
 * Rows per INSERT.
 *
 * Postgres caps a statement at 65535 bound parameters; a ticket costs roughly
 * twenty. Sixty rows keeps a wide margin and matches what the demo seed already
 * does — a number that has survived contact with a real database.
 */
const BATCH = 60;

/** Anomalies kept on the run. Beyond this the report stops being readable. */
const MAX_ANOMALIES = 500;

function pushAnomaly(report: ImportReport, anomaly: Anomaly): void {
  if (report.anomalies.length < MAX_ANOMALIES) report.anomalies.push(anomaly);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The first agent reply in a thread — our `firstRepliedAt`, and the input to
 * every SLA figure the customer will later read in reports.
 *
 * Derived rather than taken from the source: Zendesk does not publish it on the
 * ticket, and a first-reply date invented from the ticket's update time would
 * quietly falsify the one metric support teams are judged on.
 */
function firstAgentReply(ticket: SourceTicket, contactIds: Set<string>): Date | null {
  for (const message of ticket.messages) {
    const fromContact = message.authorExternalId !== null && contactIds.has(message.authorExternalId);
    if (!fromContact && !message.internal) return message.createdAt;
  }
  return null;
}

export type WriteOptions = {
  tenantId: string;
  source: ImportSource;
  /** Reports what would happen and writes nothing. */
  dryRun?: boolean;
  /** Called after each batch, for progress. */
  onProgress?: (report: ImportReport) => void | Promise<void>;
  /**
   * Credentials for fetching the files the export only names. Without them the
   * files are counted and reported as skipped rather than silently forgotten:
   * a customer who sees "0 of 412 attachments" knows to come back with a token.
   */
  attachments?: FetchOptions & { enabled?: boolean };
};

export async function writeImport(
  data: SourceExport,
  options: WriteOptions,
): Promise<ImportReport> {
  const { tenantId, source, dryRun = false } = options;
  const fetchFiles = Boolean(options.attachments?.enabled);
  const report = emptyReport();

  /* ---------- Organizations ---------- */

  report.organizations.seen = data.organizations.length;
  const orgIdByExternal = new Map<string, string>();

  const existingOrgs = data.organizations.length
    ? await db
        .select({ id: organizations.id, importedId: organizations.importedId })
        .from(organizations)
        .where(
          and(
            eq(organizations.tenantId, tenantId),
            eq(organizations.importSource, source),
            inArray(
              organizations.importedId,
              data.organizations.map((o) => o.externalId),
            ),
          ),
        )
    : [];
  for (const row of existingOrgs) {
    if (row.importedId) orgIdByExternal.set(row.importedId, row.id);
  }

  const newOrgs = data.organizations.filter((o) => !orgIdByExternal.has(o.externalId));
  report.organizations.skipped = data.organizations.length - newOrgs.length;

  for (const batch of chunk(newOrgs, BATCH)) {
    if (dryRun) {
      // A rehearsal must resolve the same way a real run does. Without these
      // placeholder ids, nothing downstream can find the organisation that
      // "would have been" created, and the report invents failures the real run
      // would never hit — the one thing a rehearsal must not do.
      for (const org of batch) orgIdByExternal.set(org.externalId, `dry-run:${org.externalId}`);
      report.organizations.created += batch.length;
      continue;
    }
    const inserted = await db
      .insert(organizations)
      .values(
        batch.map((o) => ({
          tenantId,
          name: o.name,
          emailDomains: o.emailDomains ?? [],
          notes: o.notes ?? null,
          importSource: source,
          importedId: o.externalId,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: organizations.id, importedId: organizations.importedId });
    for (const row of inserted) {
      if (row.importedId) orgIdByExternal.set(row.importedId, row.id);
    }
    report.organizations.created += inserted.length;
    await options.onProgress?.(report);
  }

  /* ---------- Contacts ---------- */

  report.contacts.seen = data.contacts.length;
  const contactIdByExternal = new Map<string, string>();

  const existingContacts = data.contacts.length
    ? await db
        .select({
          id: contacts.id,
          email: contacts.email,
          importedId: contacts.importedId,
        })
        .from(contacts)
        .where(eq(contacts.tenantId, tenantId))
    : [];
  // Two ways a contact may already be here: imported in an earlier run, or
  // created by the product because the person wrote in before the migration.
  // Both must be reused — a second row would split someone's history in half.
  const contactIdByEmail = new Map<string, string>();
  for (const row of existingContacts) {
    if (row.importedId) contactIdByExternal.set(row.importedId, row.id);
    contactIdByEmail.set(row.email.toLowerCase(), row.id);
  }

  const newContacts = data.contacts.filter((c) => {
    if (contactIdByExternal.has(c.externalId)) return false;
    const known = c.email ? contactIdByEmail.get(c.email.toLowerCase()) : undefined;
    if (known) {
      contactIdByExternal.set(c.externalId, known);
      return false;
    }
    return true;
  });
  report.contacts.skipped = data.contacts.length - newContacts.length;

  for (const batch of chunk(newContacts, BATCH)) {
    if (dryRun) {
      // Same reason as the organisations above: the tickets that follow resolve
      // their requester through this map.
      for (const contact of batch) {
        contactIdByExternal.set(contact.externalId, `dry-run:${contact.externalId}`);
      }
      report.contacts.created += batch.length;
      continue;
    }
    const inserted = await db
      .insert(contacts)
      .values(
        batch.map((c) => ({
          tenantId,
          email: c.email!,
          name: c.name ?? null,
          phone: c.phone ?? null,
          importSource: source,
          importedId: c.externalId,
          ...(c.createdAt ? { createdAt: c.createdAt } : {}),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: contacts.id, importedId: contacts.importedId });
    for (const row of inserted) {
      if (row.importedId) contactIdByExternal.set(row.importedId, row.id);
    }
    report.contacts.created += inserted.length;
    await options.onProgress?.(report);
  }

  // Attach contacts to their organisation, ignoring links already there.
  if (!dryRun) {
    const links = data.contacts
      .map((c) => {
        const contactId = contactIdByExternal.get(c.externalId);
        const organizationId = c.organizationExternalId
          ? orgIdByExternal.get(c.organizationExternalId)
          : undefined;
        return contactId && organizationId ? { tenantId, contactId, organizationId } : null;
      })
      .filter((l): l is { tenantId: string; contactId: string; organizationId: string } =>
        Boolean(l),
      );
    for (const batch of chunk(links, BATCH)) {
      await db.insert(contactOrganizations).values(batch).onConflictDoNothing();
    }
  }

  /* ---------- Tickets and their messages ---------- */

  report.tickets.seen = data.tickets.length;
  const knownContactExternalIds = new Set(contactIdByExternal.keys());

  const alreadyImported = new Set<string>();
  for (const batch of chunk(data.tickets.map((t) => t.externalId), 500)) {
    const rows = await db
      .select({ importedId: tickets.importedId })
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, tenantId),
          eq(tickets.importSource, source),
          inArray(tickets.importedId, batch),
        ),
      );
    for (const row of rows) if (row.importedId) alreadyImported.add(row.importedId);
  }

  /**
   * Numbers already taken in this workspace.
   *
   * A tenant that has been running before the migration owns numbers of its
   * own, and the source may collide with them. The colliding ticket still comes
   * in — on a fresh number, with the clash reported — because dropping a
   * customer's ticket to protect a number would be the wrong trade.
   */
  const takenNumbers = new Set<number>(
    (await db.select({ number: tickets.number }).from(tickets).where(eq(tickets.tenantId, tenantId)))
      .map((r) => r.number),
  );
  let nextFreeNumber = (takenNumbers.size ? Math.max(...takenNumbers) : 0) + 1;
  function allocateNumber(preferred: number | null): { number: number; reused: boolean } {
    if (preferred !== null && preferred > 0 && !takenNumbers.has(preferred)) {
      takenNumbers.add(preferred);
      return { number: preferred, reused: true };
    }
    while (takenNumbers.has(nextFreeNumber)) nextFreeNumber += 1;
    takenNumbers.add(nextFreeNumber);
    return { number: nextFreeNumber, reused: false };
  }

  for (const batch of chunk(data.tickets, BATCH)) {
    const rows: (typeof tickets.$inferInsert)[] = [];
    const messagesByExternal = new Map<string, SourceTicket>();

    for (const ticket of batch) {
      if (alreadyImported.has(ticket.externalId)) {
        report.tickets.skipped += 1;
        continue;
      }
      const requesterId = ticket.requesterExternalId
        ? contactIdByExternal.get(ticket.requesterExternalId)
        : undefined;
      if (!requesterId) {
        // tickets.requester_id is NOT NULL: without a contact there is no row
        // to write. Reported rather than silently dropped.
        report.tickets.failed += 1;
        pushAnomaly(report, {
          kind: "ticket_without_requester",
          object: "ticket",
          externalId: ticket.externalId,
          detail: ticket.subject,
        });
        continue;
      }

      const { number, reused } = allocateNumber(ticket.number);
      if (!reused && ticket.number !== null) {
        pushAnomaly(report, {
          kind: "duplicate_number",
          object: "ticket",
          externalId: ticket.externalId,
          detail: `${ticket.number} → ${number}`,
        });
      }

      rows.push({
        tenantId,
        number,
        subject: ticket.subject.slice(0, 500),
        status: ticket.status,
        priority: ticket.priority,
        // Every imported ticket is marked `email`: our channel list has no
        // value for phone, chat or social, and inventing one would lie in
        // reports for years.
        channel: "email",
        requesterId,
        organizationId: ticket.organizationExternalId
          ? (orgIdByExternal.get(ticket.organizationExternalId) ?? null)
          : null,
        tags: ticket.tags ?? [],
        customFields: ticket.customFields ?? {},
        firstRepliedAt: firstAgentReply(ticket, knownContactExternalIds),
        resolvedAt: ticket.resolvedAt ?? null,
        closedAt: ticket.closedAt ?? null,
        importSource: source,
        importedId: ticket.externalId,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt ?? ticket.createdAt,
      });
      messagesByExternal.set(ticket.externalId, ticket);
    }

    if (rows.length === 0) continue;
    if (dryRun) {
      report.tickets.created += rows.length;
      for (const ticket of messagesByExternal.values()) {
        report.messages.seen += ticket.messages.length;
        report.messages.created += ticket.messages.length;
        for (const message of ticket.messages) {
          report.attachments.seen += message.attachments?.length ?? 0;
        }
      }
      await options.onProgress?.(report);
      continue;
    }

    const inserted = await db
      .insert(tickets)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: tickets.id, importedId: tickets.importedId });
    report.tickets.created += inserted.length;

    const messageRows: (typeof ticketMessages.$inferInsert)[] = [];
    const attachmentsByMessage = new Map<string, NonNullable<SourceMessage["attachments"]>>();
    for (const row of inserted) {
      const ticket = row.importedId ? messagesByExternal.get(row.importedId) : undefined;
      if (!ticket) continue;
      report.messages.seen += ticket.messages.length;
      for (const message of ticket.messages) {
        const authorId =
          message.authorExternalId !== null
            ? contactIdByExternal.get(message.authorExternalId)
            : undefined;
        messageRows.push({
          tenantId,
          ticketId: row.id,
          kind: message.internal ? "internal_note" : "public_reply",
          // An author we know is the contact who wrote it; anyone else is an
          // agent of the old product, whose account does not exist here.
          authorType: authorId ? "contact" : "agent",
          authorId: authorId ?? null,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          source: "email",
          importSource: source,
          importedId: message.externalId,
          createdAt: message.createdAt,
        });
        if (message.attachments?.length) {
          attachmentsByMessage.set(message.externalId, message.attachments);
        }
      }
    }

    for (const messageBatch of chunk(messageRows, BATCH)) {
      const written = await db
        .insert(ticketMessages)
        .values(messageBatch)
        .onConflictDoNothing()
        .returning({ id: ticketMessages.id, importedId: ticketMessages.importedId });
      report.messages.created += written.length;

      for (const row of written) {
        const files = row.importedId ? attachmentsByMessage.get(row.importedId) : undefined;
        if (!files?.length) continue;
        if (!fetchFiles) {
          // Counted, not fetched: the report must show what was left behind.
          report.attachments.seen += files.length;
          report.attachments.skipped += files.length;
          continue;
        }
        await fetchAndStoreAttachments(
          tenantId,
          row.id,
          files,
          options.attachments ?? {},
          report.attachments,
          report.anomalies,
          row.importedId!,
        );
      }
    }

    await options.onProgress?.(report);
  }

  return report;
}

/** Highest ticket number in a workspace — read by the UI before a run. */
export async function highestTicketNumber(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tickets.number}), 0)` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  return row?.max ?? 0;
}
