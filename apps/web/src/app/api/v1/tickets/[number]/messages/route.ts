/**
 * /api/v1/tickets/{number}/messages — read a conversation, or add to it.
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
import { dispatchWebhookEvent } from "@openhelpdesk/webhooks";
import { deliverAgentReply } from "@/lib/deliver-reply";
import {
  apiError,
  apiJson,
  apiList,
  attachFilesToMessage,
  attachmentsForMessages,
  isMultipart,
  readJson,
  readMultipart,
  readPage,
  serializeMessage,
  withApi,
} from "@/lib/api";
import { asc, gt, or } from "drizzle-orm";

/** The whole thread, oldest first — the order a human reads it in. */
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

    const { limit, cursor } = readPage(request);
    const filters = [eq(ticketMessages.tenantId, tenant.id), eq(ticketMessages.ticketId, ticket.id)];
    if (cursor) {
      /*
       * The cursor carries BOTH the timestamp and the id, because the ordering
       * does. Paginating on the id alone while sorting by date would skip
       * messages whenever two of them share a second — which is exactly what
       * happens when a rule posts a system event next to an agent's reply.
       */
      const [at, id] = cursor.split("|");
      const from = new Date(at ?? "");
      if (Number.isNaN(from.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(
        or(
          gt(ticketMessages.createdAt, from),
          and(eq(ticketMessages.createdAt, from), gt(ticketMessages.id, id)),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(ticketMessages)
      .where(and(...filters))
      .orderBy(asc(ticketMessages.createdAt), asc(ticketMessages.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const next =
      rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null;
    const files = await attachmentsForMessages(
      tenant.id,
      page.map((m) => m.id),
    );
    return apiList(
      page.map((m) => serializeMessage(m, files.get(m.id))),
      next,
    );
  });
}

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

    /*
     * JSON or multipart, the same message either way: the app's composer
     * (MA-02) attaches a screenshot in the same gesture that sends the reply,
     * and a two-step "post, then upload" would leave a message with a promise
     * of a file that a dropped connection never keeps.
     */
    let files: File[] = [];
    let body: Record<string, unknown>;
    if (isMultipart(request)) {
      const form = await readMultipart(request);
      if (form instanceof Response) return form;
      body = form.fields;
      files = form.files;
    } else {
      const json = await readJson(request);
      if (json instanceof Response) return json;
      body = json;
    }

    const text = String(body.body ?? "").trim();
    if (!text) return apiError(400, "invalid_body_text", "body is required.");
    // A multipart field arrives as the string "true".
    const internal = body.internal === true || body.internal === "true";

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

    // Files first: the reply is delivered just below, and a reply that leaves
    // before its attachment is stored goes out without it.
    const stored = await attachFilesToMessage(tenant.id, msg!.id, files);

    /*
     * Deliver the reply to the customer, by the channel the ticket came in on.
     *
     * This was missing, and it was not a gap but a bug: an agent replying from
     * the mobile app — which posts here — had their answer recorded in the
     * thread and never sent to anyone. The web screen delivered; the API did
     * not, so the same action had two different effects depending on where it
     * was performed.
     *
     * The outcome goes back in the response on purpose. A phone that shows a
     * sent reply which WhatsApp refused (outside the 24-hour window) is worse
     * than an error: the agent moves on believing the customer was answered.
     */
    let delivery: Awaited<ReturnType<typeof deliverAgentReply>> | null = null;
    if (!internal) {
      delivery = await deliverAgentReply({
        tenantId: tenant.id,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        subject: ticket.subject,
        channel: ticket.channel,
        requesterId: ticket.requesterId,
        messageId: msg!.id,
        bodyText: text,
      });
    }

    await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

    // Only a public reply is an outbound event worth firing triggers for
    // (onContactMessage also dispatches message.created); an internal note gets
    // the webhook on its own, since integrations care about both.
    if (!internal) await onContactMessage(tenant.id, ticket.id);
    else await dispatchWebhookEvent(tenant.id, "message.created", ticket.id);

    return apiJson(
      {
        id: msg!.id,
        ticket_number: ticket.number,
        internal,
        created_at: msg!.createdAt?.toISOString() ?? null,
        attachments: stored.attachments,
        ...(delivery ? { delivery } : {}),
        ...(stored.skipped.length ? { skipped_files: stored.skipped } : {}),
      },
      201,
    );
  });
}
