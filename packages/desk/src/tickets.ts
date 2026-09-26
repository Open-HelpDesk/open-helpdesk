/**
 * A desk request IS a ticket (doctrine rule 7): same numbering, SLA,
 * assignment, search and reports. This module writes those tickets.
 *
 * The rules engine (`onTicketCreated`: triggers, SLA policy, assignment) lives
 * in @openhelpdesk/rules, which this package does not depend on. The
 * applications hand it over at start-up with `registerDeskTicketHooks` —
 * apps/worker does; apps/web should in apps/web/src/lib/desk.ts. Without it,
 * desk tickets are created but no trigger or SLA policy runs on them.
 */
import { and, eq, sql } from "drizzle-orm";
import { contactOrganizations, ticketMessages, tickets, type Tx } from "@openhelpdesk/db";
import type { Effects } from "./internal";

export type DeskTicketHooks = {
  onTicketCreated?(tenantId: string, ticketId: string): Promise<unknown>;
};

let hooks: DeskTicketHooks = {};

export function registerDeskTicketHooks(h: DeskTicketHooks): void {
  hooks = h;
}

export type DeskTicketType = "access_request" | "hardware_problem" | "tool_request";

/**
 * Next number of the tenant, taken under a transaction-scoped advisory lock so
 * two desk submissions cannot pick the same one. Other writers (email, portal)
 * are still guarded by the unique index.
 */
async function nextNumber(tx: Tx, tenantId: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ticket-number:${tenantId}`}))`);
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${tickets.number}), 0)` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  return Number(row?.max ?? 0) + 1;
}

export async function createDeskTicket(
  tx: Tx,
  fx: Effects,
  input: {
    tenantId: string;
    type: DeskTicketType;
    requesterContactId: string;
    subject: string;
    body: string;
    status?: "new" | "open" | "resolved";
  },
): Promise<{ id: string; number: number }> {
  const [orgLink] = await tx
    .select({ organizationId: contactOrganizations.organizationId })
    .from(contactOrganizations)
    .where(and(eq(contactOrganizations.tenantId, input.tenantId), eq(contactOrganizations.contactId, input.requesterContactId)))
    .limit(1);
  const number = await nextNumber(tx, input.tenantId);
  const now = new Date();
  const [ticket] = await tx
    .insert(tickets)
    .values({
      tenantId: input.tenantId,
      number,
      subject: input.subject.slice(0, 300),
      status: input.status ?? "new",
      priority: "normal",
      channel: "portal",
      type: input.type,
      requesterId: input.requesterContactId,
      organizationId: orgLink?.organizationId ?? null,
      resolvedAt: input.status === "resolved" ? now : null,
    })
    .returning({ id: tickets.id, number: tickets.number });
  await tx.insert(ticketMessages).values({
    tenantId: input.tenantId,
    ticketId: ticket!.id,
    kind: "public_reply",
    authorType: "contact",
    authorId: input.requesterContactId,
    bodyText: input.body,
    source: "portal",
  });
  const ticketId = ticket!.id;
  if (hooks.onTicketCreated) fx.add(() => hooks.onTicketCreated!(input.tenantId, ticketId));
  return ticket!;
}

/** Closes the ticket behind a finished request: resolved (done, refused) or closed (cancelled). */
export async function finishTicket(tx: Tx, tenantId: string, ticketId: string, status: "resolved" | "closed"): Promise<void> {
  const now = new Date();
  await tx
    .update(tickets)
    .set({ status, updatedAt: now, resolvedAt: now, ...(status === "closed" ? { closedAt: now } : {}) })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
}
