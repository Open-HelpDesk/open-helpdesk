/**
 * /api/v1/tickets — list and create.
 *
 * Creating a ticket goes through the SAME path as an inbound email: find or
 * create the requester contact, write the ticket on the `api` channel with its
 * first public message, then fire the rules + SLA engine (onTicketCreated). No
 * parallel write logic — the API is just another channel into the product.
 *
 * Listing is keyset-paginated on the ticket number, which is unique per
 * workspace and never reused: a caller can walk the whole history while agents
 * keep working, without skipping or repeating rows.
 */
import type { NextRequest } from "next/server";
import { and, arrayContains, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { contacts, db, nextTicketNumber, ticketMessages, tickets } from "@openhelpdesk/db";
import { onTicketCreated } from "@openhelpdesk/rules";
import {
  apiError,
  apiJson,
  apiList,
  readJson,
  readPage,
  serializeTicket,
  withApi,
} from "@/lib/api";

const STATUSES = ["new", "open", "waiting", "on_hold", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

type Status = (typeof STATUSES)[number];
type Priority = (typeof PRIORITIES)[number];

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const url = new URL(request.url);
    const { limit, cursor } = readPage(request);

    const filters = [eq(tickets.tenantId, tenant.id)];

    const status = url.searchParams.getAll("status").flatMap((s) => s.split(","));
    if (status.length) {
      const unknown = status.find((s) => !STATUSES.includes(s as Status));
      if (unknown) return apiError(400, "invalid_status", `Unknown status "${unknown}".`);
      filters.push(inArray(tickets.status, status as Status[]));
    }

    const priority = url.searchParams.getAll("priority").flatMap((p) => p.split(","));
    if (priority.length) {
      const unknown = priority.find((p) => !PRIORITIES.includes(p as Priority));
      if (unknown) return apiError(400, "invalid_priority", `Unknown priority "${unknown}".`);
      filters.push(inArray(tickets.priority, priority as Priority[]));
    }

    const assignee = url.searchParams.get("assignee_id");
    if (assignee) filters.push(eq(tickets.assigneeId, assignee));
    const organization = url.searchParams.get("organization_id");
    if (organization) filters.push(eq(tickets.organizationId, organization));
    const requester = url.searchParams.get("requester_id");
    if (requester) filters.push(eq(tickets.requesterId, requester));

    const tag = url.searchParams.get("tag");
    if (tag) filters.push(arrayContains(tickets.tags, [tag]));

    const updatedSince = url.searchParams.get("updated_since");
    if (updatedSince) {
      const since = new Date(updatedSince);
      if (Number.isNaN(since.getTime())) {
        return apiError(400, "invalid_date", "updated_since must be an ISO 8601 date-time.");
      }
      filters.push(gte(tickets.updatedAt, since));
    }

    // Newest first, so the cursor walks downwards through the numbers.
    if (cursor) {
      const from = Number(cursor);
      if (!Number.isInteger(from)) return apiError(400, "invalid_cursor", "Malformed cursor.");
      filters.push(lt(tickets.number, from));
    }

    const rows = await db
      .select()
      .from(tickets)
      .where(and(...filters))
      .orderBy(desc(tickets.number))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const next = rows.length > limit ? String(page.at(-1)!.number) : null;

    // Requesters resolved in one query rather than one per ticket.
    const requesterIds = [...new Set(page.map((t) => t.requesterId).filter(Boolean))] as string[];
    const people = requesterIds.length
      ? await db
          .select({ id: contacts.id, email: contacts.email, name: contacts.name })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenant.id), inArray(contacts.id, requesterIds)))
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));

    return apiList(
      page.map((t) => serializeTicket(t, t.requesterId ? (byId.get(t.requesterId) ?? null) : null)),
      next,
    );
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
    if (!PRIORITIES.includes(priority as Priority)) {
      return apiError(400, "invalid_priority", `Unknown priority "${priority}".`);
    }

    const tags = Array.isArray(body.tags)
      ? (body.tags as unknown[]).map((t) => String(t).trim()).filter(Boolean).slice(0, 30)
      : [];
    const customFields =
      body.custom_fields && typeof body.custom_fields === "object" && !Array.isArray(body.custom_fields)
        ? (body.custom_fields as Record<string, unknown>)
        : {};

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
        priority: priority as Priority,
        channel: "api",
        requesterId: contact!.id,
        organizationId: body.organization_id ? String(body.organization_id) : null,
        tags,
        customFields,
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
