/**
 * /api/v1/tickets/{number} — read one, or update its properties.
 *
 * A ticket is addressed by its per-tenant number (the one agents see), not its
 * internal id. PATCH touches only the fields an integration should set:
 * status, priority, assignee.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { contacts, db, tickets, users } from "@openhelpdesk/db";
import { dispatchTicketChanged } from "@openhelpdesk/webhooks";
import { apiError, apiJson, readJson, serializeTicket, withApi } from "@/lib/api";

const STATUSES = ["new", "open", "waiting", "on_hold", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

async function loadTicket(tenantId: string, numberParam: string) {
  const number = Number(numberParam);
  if (!Number.isInteger(number)) return null;
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, number)));
  return ticket ?? null;
}

async function withRequester(tenantId: string, requesterId: string | null) {
  if (!requesterId) return null;
  const [c] = await db
    .select({ id: contacts.id, email: contacts.email, name: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, requesterId)));
  return c ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { number } = await params;
    const ticket = await loadTicket(tenant.id, number);
    if (!ticket) return apiError(404, "not_found", "No ticket with that number.");
    return apiJson(serializeTicket(ticket, await withRequester(tenant.id, ticket.requesterId)));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { number } = await params;
    const ticket = await loadTicket(tenant.id, number);
    if (!ticket) return apiError(404, "not_found", "No ticket with that number.");

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const patch: Partial<typeof tickets.$inferInsert> = {};
    if (body.status !== undefined) {
      if (!STATUSES.includes(String(body.status) as (typeof STATUSES)[number])) {
        return apiError(400, "invalid_status", `Unknown status "${String(body.status)}".`);
      }
      patch.status = String(body.status) as (typeof STATUSES)[number];
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(String(body.priority) as (typeof PRIORITIES)[number])) {
        return apiError(400, "invalid_priority", `Unknown priority "${String(body.priority)}".`);
      }
      patch.priority = String(body.priority) as (typeof PRIORITIES)[number];
    }
    if (body.assignee_id !== undefined) {
      const assigneeId = body.assignee_id === null ? null : String(body.assignee_id);
      if (assigneeId) {
        // An assignee must be a member of this workspace — never a stranger's id.
        const [agent] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.tenantId, tenant.id), eq(users.id, assigneeId)));
        if (!agent) return apiError(400, "invalid_assignee", "assignee_id is not an agent of this workspace.");
      }
      patch.assigneeId = assigneeId;
    }
    if (Object.keys(patch).length === 0) {
      return apiError(400, "empty_patch", "Provide at least one of: status, priority, assignee_id.");
    }
    patch.updatedAt = new Date();

    const [updated] = await db
      .update(tickets)
      .set(patch)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticket.id)))
      .returning();

    await dispatchTicketChanged(tenant.id, ticket.id, ticket.status, updated!.status);

    return apiJson(serializeTicket(updated!, await withRequester(tenant.id, updated!.requesterId)));
  });
}
