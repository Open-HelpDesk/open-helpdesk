/**
 * /api/v1/tickets — list and create.
 *
 * Creating a ticket goes through the SAME path as an inbound email: find or
 * create the requester contact, write the ticket on the `api` channel with its
 * first public message, then fire the rules + SLA engine (onTicketCreated). No
 * parallel write logic — the API is just another channel into the product.
 */
import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { contacts, db, nextTicketNumber, ticketMessages, tickets } from "@openhelpdesk/db";
import { onTicketCreated } from "@openhelpdesk/rules";
import { apiError, apiJson, readJson, serializeTicket, withApi } from "@/lib/api";

const STATUSES = ["new", "open", "waiting", "on_hold", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    const statusFilter = url.searchParams.get("status");
    if (statusFilter && !STATUSES.includes(statusFilter as (typeof STATUSES)[number])) {
      return apiError(400, "invalid_status", `Unknown status "${statusFilter}".`);
    }

    const where = statusFilter
      ? and(eq(tickets.tenantId, tenant.id), eq(tickets.status, statusFilter as (typeof STATUSES)[number]))
      : eq(tickets.tenantId, tenant.id);

    const rows = await db
      .select()
      .from(tickets)
      .where(where)
      .orderBy(desc(tickets.number))
      .limit(limit);

    return apiJson({ data: rows.map((t) => serializeTicket(t)) });
  });
}

export async function POST(request: NextRequest) {
  return withApi(request, "ticket:create", async ({ tenant }) => {
    const body = await readJson(request);
    if (body instanceof Response) return body;

    const email = String(body.requester_email ?? "").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!email.includes("@")) return apiError(400, "invalid_requester", "requester_email must be a valid email.");
    if (!subject) return apiError(400, "invalid_subject", "subject is required.");
    if (!message) return apiError(400, "invalid_message", "message is required.");

    const priority = body.priority ? String(body.priority) : "normal";
    if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
      return apiError(400, "invalid_priority", `Unknown priority "${priority}".`);
    }

    // Find or create the requester — same email-uniqueness rule as ingestion.
    let [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));
    if (contact?.blocked) return apiError(403, "requester_blocked", "This requester is blocked.");
    if (!contact) {
      [contact] = await db
        .insert(contacts)
        .values({ tenantId: tenant.id, email, name: body.requester_name ? String(body.requester_name) : null })
        .returning();
    }

    const number = await nextTicketNumber(tenant.id);
    const [ticket] = await db
      .insert(tickets)
      .values({
        tenantId: tenant.id,
        number,
        subject: subject.slice(0, 500),
        status: "new",
        priority: priority as (typeof PRIORITIES)[number],
        channel: "api",
        requesterId: contact!.id,
      })
      .returning();

    await db.insert(ticketMessages).values({
      tenantId: tenant.id,
      ticketId: ticket!.id,
      kind: "public_reply",
      authorType: "contact",
      authorId: contact!.id,
      bodyText: message,
      source: "api",
    });

    await onTicketCreated(tenant.id, ticket!.id);

    return apiJson(
      serializeTicket(ticket!, { id: contact!.id, email: contact!.email, name: contact!.name }),
      201,
    );
  });
}
