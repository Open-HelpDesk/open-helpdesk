/**
 * /api/v1/tickets/{number}/messages — add a reply or an internal note.
 *
 * A public reply is a message TO the customer and goes out through the same
 * onContactMessage path the product uses (so triggers and notifications fire);
 * an internal note stays inside the workspace. The author is an agent of this
 * workspace, named by agent_id.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ticketMessages, tickets, users } from "@openhelpdesk/db";
import { onContactMessage } from "@openhelpdesk/rules";
import { apiError, apiJson, readJson, withApi } from "@/lib/api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { number } = await params;
    const n = Number(number);
    if (!Number.isInteger(n)) return apiError(404, "not_found", "No ticket with that number.");
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, n)));
    if (!ticket) return apiError(404, "not_found", "No ticket with that number.");

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const text = String(body.body ?? "").trim();
    if (!text) return apiError(400, "invalid_body_text", "body is required.");
    const internal = body.internal === true;

    const agentId = body.agent_id ? String(body.agent_id) : null;
    if (agentId) {
      const [agent] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), eq(users.id, agentId)));
      if (!agent) return apiError(400, "invalid_agent", "agent_id is not an agent of this workspace.");
    }

    const [msg] = await db
      .insert(ticketMessages)
      .values({
        tenantId: tenant.id,
        ticketId: ticket.id,
        kind: internal ? "internal_note" : "public_reply",
        authorType: "agent",
        authorId: agentId,
        bodyText: text,
        source: "api",
      })
      .returning({ id: ticketMessages.id, createdAt: ticketMessages.createdAt });

    await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

    // Only a public reply is an outbound event worth firing triggers for.
    if (!internal) await onContactMessage(tenant.id, ticket.id);

    return apiJson(
      {
        id: msg!.id,
        ticket_number: ticket.number,
        internal,
        created_at: msg!.createdAt?.toISOString() ?? null,
      },
      201,
    );
  });
}
