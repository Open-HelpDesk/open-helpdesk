/**
 * /api/v1/tickets/{number}/read — "I have looked at this thread" (MA-01/MA-02).
 *
 * Explicit rather than implied by the GET: a read that happens as a side effect
 * of fetching cannot be retried, prefetched or cached, and the app fetches a
 * ticket for reasons other than a human reading it — a push tap that lands on a
 * list, a background refresh.
 *
 * The mark is per agent and per ticket, which is what makes the unread dot mean
 * anything: a colleague opening the ticket does not clear mine.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tickets } from "@openhelpdesk/db";
import { apiError, apiJson, requireDeviceAgent, withApi } from "@/lib/api";
import { markTicketRead } from "@/lib/ticket-reads";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  return withApi(request, "write", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const { number } = await params;
    const n = Number(number);
    if (!Number.isInteger(n)) return apiError(404, "not_found", "No ticket with that number.");
    const [ticket] = await db
      .select({ id: tickets.id, number: tickets.number })
      .from(tickets)
      .where(and(eq(tickets.tenantId, auth.tenant.id), eq(tickets.number, n)));
    if (!ticket) return apiError(404, "not_found", "No ticket with that number.");

    const readAt = await markTicketRead(auth.tenant.id, agent.id, ticket.id);
    return apiJson({ number: ticket.number, read_at: readAt.toISOString(), unread: false });
  });
}
