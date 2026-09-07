/**
 * Writing on behalf of a customer — one implementation, two callers.
 *
 * The portal's server actions (app/help/actions.ts) used to hold this logic
 * inline; the mobile client app (MC-xx) needs exactly the same writes over the
 * REST API. Two copies would have drifted the moment one of them learned
 * something — a reopen rule, an organisation link, a rules-engine hook — so the
 * writes live here and both surfaces call them. The actions keep what is theirs
 * alone: form parsing, redirects, cache revalidation.
 *
 * Everything here goes through the same rules engine the product uses for an
 * inbound email (`onTicketCreated`, `onContactMessage`). A request that arrived
 * from a phone must fire the same triggers, SLA policies and notifications as
 * one that arrived by mail — there is no quiet back door.
 */
import { and, arrayContains, eq } from "drizzle-orm";
import {
  contactOrganizations,
  contacts,
  db,
  nextTicketNumber,
  organizations,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { onContactMessage, onTicketCreated } from "@openhelpdesk/rules";
import { storeFilesOnMessage } from "@/lib/storage";

export type PortalContact = typeof contacts.$inferSelect;

/**
 * The customer behind an address, created on first contact.
 *
 * An account is implicit on the portal (PT-07): asking someone to register
 * before they can report a problem is a support queue with a form in front of
 * it. The new contact is attached to the organisation whose verified domain
 * matches their address, which is what makes "my company's requests" work
 * without an administrator linking people by hand.
 */
export async function findOrCreateContact(tenantId: string, email: string, name?: string) {
  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email)));
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ tenantId, email, name: name || null })
      .returning();
    const domain = email.split("@")[1] ?? "";
    const [org] = domain
      ? await db
          .select()
          .from(organizations)
          .where(
            and(
              eq(organizations.tenantId, tenantId),
              arrayContains(organizations.emailDomains, [domain]),
            ),
          )
      : [];
    if (contact && org) {
      await db.insert(contactOrganizations).values({
        tenantId,
        contactId: contact.id,
        organizationId: org.id,
      });
    }
  }
  return contact!;
}

export type NewPortalRequest = {
  tenantId: string;
  contact: { id: string };
  subject: string;
  body: string;
  /** The label agents will read, in the workspace's language — not a key. */
  type?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  customFields?: Record<string, unknown>;
  files?: File[];
};

/**
 * A new request, its first message, and the engine that reacts to it.
 *
 * `channel` is "portal" whether the request came from the web portal or from
 * the app: both are the customer serving themselves, which is what the channel
 * is there to say. Calling the mobile one "api" would file it next to a CRM
 * integration in every report.
 */
export async function createPortalRequest(input: NewPortalRequest) {
  const [orgLink] = await db
    .select({ organizationId: contactOrganizations.organizationId })
    .from(contactOrganizations)
    .where(eq(contactOrganizations.contactId, input.contact.id))
    .limit(1);

  const number = await nextTicketNumber(input.tenantId);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: input.tenantId,
      number,
      subject: input.subject,
      status: "new",
      priority: input.priority ?? "normal",
      channel: "portal",
      type: input.type ?? null,
      requesterId: input.contact.id,
      organizationId: orgLink?.organizationId ?? null,
      customFields: input.customFields ?? {},
    })
    .returning();
  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: input.tenantId,
      ticketId: ticket!.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: input.contact.id,
      bodyText: input.body,
      source: "portal",
    })
    .returning();
  const stored =
    input.files?.length && message
      ? (await storeFilesOnMessage(input.tenantId, message.id, input.files)).stored
      : [];
  await onTicketCreated(input.tenantId, ticket!.id);
  return { ticket: ticket!, message: message ?? null, attachments: stored };
}

/**
 * A customer's reply on their own request.
 *
 * Answering reopens what was waiting, on hold or resolved: a customer who
 * writes back has not finished, and leaving the ticket resolved is how an
 * answer goes unread. Closed is left alone — that door is shut deliberately.
 *
 * The caller decides who may reply; this only writes.
 */
export async function replyToPortalRequest(input: {
  tenantId: string;
  contact: { id: string };
  ticket: { id: string; status: string };
  body: string;
  files?: File[];
}) {
  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: input.tenantId,
      ticketId: input.ticket.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: input.contact.id,
      bodyText: input.body,
      source: "portal",
    })
    .returning();
  const stored =
    input.files?.length && message
      ? (await storeFilesOnMessage(input.tenantId, message.id, input.files)).stored
      : [];
  const reopen = ["waiting", "on_hold", "resolved"].includes(input.ticket.status);
  await db
    .update(tickets)
    .set({ updatedAt: new Date(), ...(reopen ? { status: "open" as const, resolvedAt: null } : {}) })
    .where(eq(tickets.id, input.ticket.id));
  await onContactMessage(input.tenantId, input.ticket.id);
  return message ? { message, attachments: stored } : null;
}
