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
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  ticketMessages,
  tickets,
  whatsappConversations,
  whatsappMessages,
} from "@openhelpdesk/db";
import { getWhatsappSettings, resolveConfig } from "./settings";
import { serviceWindow } from "./window";

const GRAPH = "https://graph.facebook.com/v21.0";

export type SendResult =
  | { outcome: "sent"; wamid: string }
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
    await record(tenantId, row.ticketId, messageId, "out_of_window", outOfWindowError(window.closesAt));
    return { outcome: "out_of_window", closesAt: window.closesAt };
  }

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
        to: conversation.waId,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } }
      | null;

    if (!response.ok) {
      const error = payload?.error?.message ?? `HTTP ${response.status}`;
      await record(tenantId, row.ticketId, messageId, "failed", error);
      return { outcome: "failed", error };
    }

    const wamid = payload?.messages?.[0]?.id ?? "";
    // Recorded even without an id: the message left, and the absence of an id
    // only costs us the delivery receipt, not the trace that we sent.
    await record(tenantId, row.ticketId, messageId, "sent", null, wamid);
    return { outcome: "sent", wamid };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await record(tenantId, row.ticketId, messageId, "failed", error);
    return { outcome: "failed", error };
  }
}

function outOfWindowError(closesAt: Date | null): string {
  return closesAt
    ? `Outside the 24-hour service window (closed ${closesAt.toISOString()}). A pre-approved template is required.`
    : "The customer has never written on WhatsApp: no service window is open.";
}

async function record(
  tenantId: string,
  ticketId: string,
  messageId: string,
  status: "sent" | "failed" | "out_of_window",
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
