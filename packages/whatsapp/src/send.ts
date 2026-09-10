/**
 * Outbound: an agent's public reply → a WhatsApp message.
 *
 * The refusal path matters more than the happy path here. Two things must never
 * happen, and both are silent failures if nobody writes them down:
 *
 *  1. **An internal note must never leave.** A note relayed to WhatsApp reaches
 *     the customer permanently — WhatsApp only allows deleting a message inside
 *     a short window. The caller decides, but this module refuses anything that
 *     is not a public reply written by an agent, so a future caller cannot get
 *     it wrong either.
 *  2. **An agent must learn that a send was refused.** Outside the 24-hour
 *     window Meta rejects free-form messages. An agent who typed an answer and
 *     saw nothing happen believes they replied. The refusal is therefore
 *     recorded on the ticket AND returned to the caller, which posts a system
 *     event.
 */
import { and, asc, desc, eq, gt } from "drizzle-orm";
import {
  db,
  ticketMessages,
  tickets,
  whatsappConversations,
  whatsappMessages,
} from "@openhelpdesk/db";
import { getWhatsappSettings, resolveConfig } from "./settings";
import type { WhatsappConfig } from "./types";
import { closedWindowPlan, serviceWindow } from "./window";

const GRAPH = "https://graph.facebook.com/v21.0";

export type SendResult =
  | { outcome: "sent"; wamid: string }
  /**
   * The window is closed, the reply is kept, and the customer has been
   * prompted with the pre-approved template. `prompted` says whether the
   * template actually left — it is false when we had already prompted since
   * the customer's last message, which is deliberate: one prompt per silence,
   * not one per agent reply.
   */
  | { outcome: "queued"; closesAt: Date | null; prompted: boolean }
  /** The window is closed and nothing can be done: no template configured. */
  | { outcome: "out_of_window"; closesAt: Date | null }
  | { outcome: "skipped"; reason: "not_whatsapp" | "not_public_agent_reply" | "not_configured" }
  | { outcome: "failed"; error: string };

/**
 * Sends the given ticket message to the customer's WhatsApp, if it should go.
 *
 * `fetchImpl` is injected so the whole path is testable without a network. The
 * default is the real `fetch`.
 */
export async function sendMessageToWhatsapp(
  tenantId: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const [row] = await db
    .select({
      id: ticketMessages.id,
      kind: ticketMessages.kind,
      authorType: ticketMessages.authorType,
      bodyText: ticketMessages.bodyText,
      ticketId: ticketMessages.ticketId,
      channel: tickets.channel,
      // La variable {{1}} du gabarit : le numéro que le client reconnaît.
      ticketNumber: tickets.number,
    })
    .from(ticketMessages)
    .innerJoin(tickets, eq(tickets.id, ticketMessages.ticketId))
    .where(and(eq(ticketMessages.tenantId, tenantId), eq(ticketMessages.id, messageId)));
  if (!row) return { outcome: "skipped", reason: "not_whatsapp" };
  if (row.channel !== "whatsapp") return { outcome: "skipped", reason: "not_whatsapp" };

  // The guard that matters. Both conditions, not either: a contact's own
  // message must not be echoed back, and a note must not leave at all.
  if (row.kind !== "public_reply" || row.authorType !== "agent") {
    return { outcome: "skipped", reason: "not_public_agent_reply" };
  }
  const text = (row.bodyText ?? "").trim();
  if (!text) return { outcome: "skipped", reason: "not_public_agent_reply" };

  const settings = await getWhatsappSettings(tenantId);
  const config = settings ? resolveConfig(settings) : null;
  if (!settings?.active || !config) return { outcome: "skipped", reason: "not_configured" };

  // The requester's conversation, which carries both the number and the window.
  const [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.tenantId, tenantId),
        eq(whatsappConversations.activeTicketId, row.ticketId),
      ),
    )
    .orderBy(desc(whatsappConversations.updatedAt));
  if (!conversation) return { outcome: "skipped", reason: "not_whatsapp" };

  const window = serviceWindow(conversation.lastInboundAt);
  if (!window.open) {
    /*
     * The window is closed. The reply is NOT lost, and that is the whole point
     * of this branch.
     *
     * Before it, an agent's answer was refused and written into the thread as a
     * refusal. The agent then had no move left: they could not reach the
     * customer, and the answer they had written stayed there, unsent, until
     * someone noticed. The customer, meanwhile, had no reason to write again —
     * they were waiting.
     *
     * So: keep the reply, and prompt the customer with the one message Meta
     * accepts outside the window — a template approved in advance. When they
     * answer, the window opens and `flushQueued` sends what was waiting, in
     * order. Nothing is invented and nothing is dropped.
     */
    const plan = closedWindowPlan({
      templateName: settings.templateName,
      templateLang: settings.templateLang,
      alreadyPrompted: await promptedSince(tenantId, row.ticketId, conversation.lastInboundAt),
    });

    if (plan === "refuse") {
      await record(
        tenantId, row.ticketId, messageId, "out_of_window", outOfWindowError(window.closesAt),
      );
      return { outcome: "out_of_window", closesAt: window.closesAt };
    }

    await record(tenantId, row.ticketId, messageId, "queued", null);
    if (plan === "queue_only") {
      return { outcome: "queued", closesAt: window.closesAt, prompted: false };
    }

    const prompt = await sendTemplate(
      config, conversation.waId, settings.templateName!, settings.templateLang!,
      String(row.ticketNumber), fetchImpl,
    );
    await recordTemplate(tenantId, row.ticketId, prompt);
    return { outcome: "queued", closesAt: window.closesAt, prompted: prompt.ok };
  }

  return sendText(tenantId, row.ticketId, messageId, config, conversation.waId, text, fetchImpl);
}

/**
 * The raw text send, shared by the direct path and by the queue flush.
 *
 * Extracted rather than duplicated: a flushed reply and a live reply must reach
 * the customer identically, and must be recorded identically. Two copies would
 * drift on the day one of them gains a delivery receipt or a retry.
 */
async function sendText(
  tenantId: string,
  ticketId: string,
  messageId: string,
  config: WhatsappConfig,
  waId: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<SendResult> {
  try {
    const response = await fetchImpl(`${GRAPH}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } }
      | null;

    if (!response.ok) {
      const error = payload?.error?.message ?? `HTTP ${response.status}`;
      await record(tenantId, ticketId, messageId, "failed", error);
      return { outcome: "failed", error };
    }

    const wamid = payload?.messages?.[0]?.id ?? "";
    // Recorded even without an id: the message left, and the absence of an id
    // only costs us the delivery receipt, not the trace that we sent.
    await record(tenantId, ticketId, messageId, "sent", null, wamid);
    return { outcome: "sent", wamid };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await record(tenantId, ticketId, messageId, "failed", error);
    return { outcome: "failed", error };
  }
}

/**
 * Sends the pre-approved template that re-opens a closed window.
 *
 * One positional variable, `{{1}}`, carrying the ticket number. That choice is
 * a constraint and not a preference: a template's wording is fixed at approval
 * time, so the variable cannot carry the agent's answer — Meta approved a
 * sentence, not a channel for arbitrary text, and stuffing a reply into it is
 * how an account gets its templates revoked. The template's job is to make the
 * customer write, which re-opens the window; the answer then goes as normal
 * text.
 *
 * A template with no variable also works: Meta ignores an unused parameter
 * list, so the same call fits both.
 */
export async function sendTemplate(
  config: WhatsappConfig,
  waId: string,
  name: string,
  language: string,
  variable: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; wamid: string; error: string | null }> {
  try {
    const response = await fetchImpl(`${GRAPH}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "template",
        template: {
          name,
          language: { code: language },
          components: [
            { type: "body", parameters: [{ type: "text", text: variable }] },
          ],
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string } }
      | null;
    if (!response.ok) {
      return { ok: false, wamid: "", error: payload?.error?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, wamid: payload?.messages?.[0]?.id ?? "", error: null };
  } catch (err) {
    return { ok: false, wamid: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends every reply that was waiting on this conversation's window.
 *
 * Called from the ingest, right after an inbound message re-opened the window.
 * In order of writing — a thread read out of order is worse than a late thread.
 *
 * A flush that fails leaves the row as `failed` and does not retry: the agent
 * sees it in the thread, which is the same contract as a live send. Retrying
 * silently would send an answer hours later, after the agent has written
 * another one.
 */
export async function flushQueued(
  tenantId: string,
  ticketId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; failed: number }> {
  const settings = await getWhatsappSettings(tenantId);
  const config = settings ? resolveConfig(settings) : null;
  if (!settings?.active || !config) return { sent: 0, failed: 0 };

  const [conversation] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.tenantId, tenantId),
        eq(whatsappConversations.activeTicketId, ticketId),
      ),
    );
  if (!conversation) return { sent: 0, failed: 0 };

  const waiting = await db
    .select({ id: whatsappMessages.id, messageId: whatsappMessages.messageId })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.ticketId, ticketId),
        eq(whatsappMessages.status, "queued"),
      ),
    )
    .orderBy(asc(whatsappMessages.createdAt));

  let sent = 0;
  let failed = 0;
  for (const queued of waiting) {
    if (!queued.messageId) continue;
    const [message] = await db
      .select({ bodyText: ticketMessages.bodyText })
      .from(ticketMessages)
      .where(and(eq(ticketMessages.tenantId, tenantId), eq(ticketMessages.id, queued.messageId)));
    const text = (message?.bodyText ?? "").trim();
    if (!text) continue;

    /*
     * The queued row is removed before the send, so the new row written by
     * `sendText` is the record of what happened. Leaving it would collide on
     * the unique `(tenant, wamid)` index — the queued row holds the synthetic
     * `local:<id>` key that a failed send would want to reuse.
     */
    await db.delete(whatsappMessages).where(eq(whatsappMessages.id, queued.id));
    const result = await sendText(
      tenantId, ticketId, queued.messageId, config, conversation.waId, text, fetchImpl,
    );
    if (result.outcome === "sent") sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/** Have we already prompted this customer since their last message? */
async function promptedSince(
  tenantId: string,
  ticketId: string,
  lastInboundAt: Date | null,
): Promise<boolean> {
  const rows = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.tenantId, tenantId),
        eq(whatsappMessages.ticketId, ticketId),
        eq(whatsappMessages.template, true),
        eq(whatsappMessages.status, "sent"),
        // No inbound message yet: any prompt we ever sent is still the current
        // one, so there is nothing to compare against.
        ...(lastInboundAt ? [gt(whatsappMessages.createdAt, lastInboundAt)] : []),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function recordTemplate(
  tenantId: string,
  ticketId: string,
  prompt: { ok: boolean; wamid: string; error: string | null },
): Promise<void> {
  await db
    .insert(whatsappMessages)
    .values({
      tenantId,
      wamid: prompt.wamid || `local:template:${ticketId}:${Date.now()}`,
      direction: "outbound",
      ticketId,
      template: true,
      status: prompt.ok ? "sent" : "failed",
      error: prompt.error,
    })
    .onConflictDoNothing();
}

function outOfWindowError(closesAt: Date | null): string {
  return closesAt
    ? `Outside the 24-hour service window (closed ${closesAt.toISOString()}). No template is configured, so the customer cannot be prompted.`
    : "The customer has never written on WhatsApp: no service window is open.";
}

async function record(
  tenantId: string,
  ticketId: string,
  messageId: string,
  status: "sent" | "queued" | "failed" | "out_of_window",
  error: string | null,
  wamid?: string,
): Promise<void> {
  await db
    .insert(whatsappMessages)
    .values({
      tenantId,
      // No id from Meta means no natural key: we mint one from our own message
      // id, which keeps the unique index meaningful instead of colliding on "".
      wamid: wamid || `local:${messageId}`,
      direction: "outbound",
      ticketId,
      messageId,
      status,
      error,
    })
    .onConflictDoNothing();
}

/**
 * The state of the window for a ticket, for the agent's screen.
 *
 * Returned as data rather than a formatted string: the countdown belongs to the
 * interface, and a package cannot reach the translation dictionaries.
 */
export async function ticketServiceWindow(tenantId: string, ticketId: string) {
  const [conversation] = await db
    .select({ lastInboundAt: whatsappConversations.lastInboundAt })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.tenantId, tenantId),
        eq(whatsappConversations.activeTicketId, ticketId),
      ),
    );
  return serviceWindow(conversation?.lastInboundAt ?? null);
}

/**
 * Downloads a media file from Meta. Two calls: the id gives a URL, the URL
 * gives the bytes, and both need the token.
 */
export async function fetchMedia(
  mediaId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  const meta = await fetchImpl(`${GRAPH}/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!meta.ok) return null;
  const { url } = (await meta.json()) as { url?: string };
  if (!url) return null;
  const file = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!file.ok) return null;
  return new Uint8Array(await file.arrayBuffer());
}
