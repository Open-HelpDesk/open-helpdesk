/**
 * /api/v1/tickets/{number}/attachments — every file on a ticket's thread.
 *
 * Listed here rather than only inside each message, because the question an
 * integration actually asks is "what did this customer send us", not "what was
 * on message four".
 */
import type { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { attachments, db, ticketMessages, tickets } from "@openhelpdesk/db";
import { apiError, apiList, serializeAttachment, withApi } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { number } = await params;
    const n = Number(number);
    if (!Number.isInteger(n)) return apiError(404, "not_found", "No ticket with that number.");
    const [ticket] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, n)));
    if (!ticket) return apiError(404, "not_found", "No ticket with that number.");

    const rows = await db
      .select({ a: attachments })
      .from(attachments)
      .innerJoin(ticketMessages, eq(ticketMessages.id, attachments.messageId))
      .where(and(eq(attachments.tenantId, tenant.id), eq(ticketMessages.ticketId, ticket.id)))
      .orderBy(asc(attachments.createdAt));

    return apiList(rows.map((r) => serializeAttachment(r.a)), null);
  });
}
