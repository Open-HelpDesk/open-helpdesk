/**
 * The public shape of a ticket, shared by the REST API and the webhook payloads.
 *
 * One definition on purpose: an integrator who reads `GET /api/v1/tickets/{n}`
 * and then receives a `ticket.updated` webhook must see the same fields with the
 * same names. Two serializers would drift, and the drift would land in whoever's
 * integration.
 */
import { and, contacts, db, eq, tickets } from "./deps";

export type TicketPayload = {
  number: number;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  type: string | null;
  requester: { id: string; email: string; name: string | null } | null;
  assignee_id: string | null;
  organization_id: string | null
  created_at: string | null;
  updated_at: string | null;
};

export function serializeTicket(
  t: typeof tickets.$inferSelect,
  requester?: { id: string; email: string; name: string | null } | null,
): TicketPayload {
  return {
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    type: t.type,
    requester: requester ? { id: requester.id, email: requester.email, name: requester.name } : null,
    assignee_id: t.assigneeId,
    organization_id: t.organizationId,
    created_at: t.createdAt?.toISOString() ?? null,
    updated_at: t.updatedAt?.toISOString() ?? null,
  };
}

/** Loads a ticket and its requester, already serialized — used to build an event. */
export async function ticketPayload(
  tenantId: string,
  ticketId: string,
): Promise<TicketPayload | null> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket) return null;
  const requester = ticket.requesterId
    ? (
        await db
          .select({ id: contacts.id, email: contacts.email, name: contacts.name })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, ticket.requesterId)))
      )[0] ?? null
    : null;
  return serializeTicket(ticket, requester);
}
