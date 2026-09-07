/**
 * Has this agent seen this thread? (MA-01, the unread dot.)
 *
 * "Unread" is a comparison, not a flag: the newest message somebody else wrote
 * against the moment this agent last opened the ticket. Storing a boolean would
 * have meant writing to every assignee's row on every inbound message — a
 * fan-out on the hot path of the mail pipeline — and getting it wrong the first
 * time an import backfilled a year of conversations.
 *
 * What counts as something to read: a public reply or an internal note that the
 * agent did not write themselves. System events are the product talking to
 * itself, and their own reply is not news to them.
 */
import { and, eq, inArray, max, ne, or, sql } from "drizzle-orm";
import { db, ticketMessages, ticketReads } from "@openhelpdesk/db";

/**
 * Unread state for a page of tickets, in two queries rather than two per row.
 *
 * Returns a map keyed by ticket id; a ticket with no entry has nothing to read
 * at all (no message from anyone else), which is not the same as read and is
 * reported as `false` all the same — there is no dot to draw either way.
 */
export async function unreadByTicket(
  tenantId: string,
  agentId: string,
  ticketIds: string[],
): Promise<Map<string, boolean>> {
  const unread = new Map<string, boolean>();
  if (ticketIds.length === 0) return unread;

  const [latest, reads] = await Promise.all([
    db
      .select({ ticketId: ticketMessages.ticketId, at: max(ticketMessages.createdAt) })
      .from(ticketMessages)
      .where(
        and(
          eq(ticketMessages.tenantId, tenantId),
          inArray(ticketMessages.ticketId, ticketIds),
          inArray(ticketMessages.kind, ["public_reply", "internal_note"]),
          // Not mine: an agent's own reply cannot be news to them. `is distinct
          // from` rather than `<>` because a message written through the API
          // with no agent_id has a null author, and null <> x is null — which
          // would drop the row from the comparison instead of keeping it.
          or(
            ne(ticketMessages.authorType, "agent"),
            sql`${ticketMessages.authorId} is distinct from ${agentId}`,
          ),
        ),
      )
      .groupBy(ticketMessages.ticketId),
    db
      .select({ ticketId: ticketReads.ticketId, readAt: ticketReads.readAt })
      .from(ticketReads)
      .where(
        and(
          eq(ticketReads.tenantId, tenantId),
          eq(ticketReads.userId, agentId),
          inArray(ticketReads.ticketId, ticketIds),
        ),
      ),
  ]);

  const readAt = new Map(reads.map((r) => [r.ticketId, r.readAt]));
  for (const id of ticketIds) unread.set(id, false);
  for (const row of latest) {
    if (!row.at) continue;
    const seen = readAt.get(row.ticketId);
    unread.set(row.ticketId, !seen || row.at > seen);
  }
  return unread;
}

/** The same answer for one ticket. */
export async function isTicketUnread(
  tenantId: string,
  agentId: string,
  ticketId: string,
): Promise<boolean> {
  const map = await unreadByTicket(tenantId, agentId, [ticketId]);
  return map.get(ticketId) ?? false;
}

/**
 * Record that the agent has just read the ticket.
 *
 * An upsert on the pair: reading the same thread twice is not two facts. The
 * timestamp is the server's, not the client's — a phone with a wrong clock
 * would otherwise mark tomorrow's messages read.
 */
export async function markTicketRead(
  tenantId: string,
  agentId: string,
  ticketId: string,
): Promise<Date> {
  const readAt = new Date();
  await db
    .insert(ticketReads)
    .values({ tenantId, ticketId, userId: agentId, readAt })
    .onConflictDoUpdate({
      target: [ticketReads.ticketId, ticketReads.userId],
      set: { readAt },
    });
  return readAt;
}
