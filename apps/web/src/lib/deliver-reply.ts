/**
 * Delivering an agent's public reply to the requester, by the channel the
 * ticket came in on.
 *
 * Before WhatsApp there was one delivery path and no decision to make: every
 * public reply went out as an email to the requester's address. A second
 * channel turns that into a routing question, and getting it wrong is not
 * cosmetic:
 *
 *  - a WhatsApp contact has **no email** — the product stores a derived
 *    `<number>@whatsapp.invalid` so the contact record is valid, and sending an
 *    email there would bounce, pollute the delivery log, and hurt the domain's
 *    sender reputation for nothing;
 *  - a refusal has to reach the agent. Outside WhatsApp's 24-hour window the
 *    send is rejected, and an agent who typed an answer and saw nothing happen
 *    believes they replied. The refusal is written into the thread as a system
 *    event, which is the only place an agent is certain to look.
 *
 * The function never throws: a delivery failure must not roll back a reply the
 * agent already wrote and can see.
 */
import { eq } from "drizzle-orm";
import { contacts, db, ticketMessages } from "@openhelpdesk/db";
import { sendTicketReplyEmail } from "@openhelpdesk/mail";

export type DeliverInput = {
  tenantId: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  channel: string;
  requesterId: string;
  messageId: string;
  bodyText: string;
};

export type DeliverOutcome =
  | { via: "email"; messageId?: string }
  | { via: "whatsapp"; sent: boolean; outOfWindow: boolean }
  | { via: "none"; reason: "no_requester" | "unroutable_address" };

export async function deliverAgentReply(input: DeliverInput): Promise<DeliverOutcome> {
  if (input.channel === "whatsapp") return deliverWhatsapp(input);

  const [requester] = await db
    .select({ email: contacts.email })
    .from(contacts)
    .where(eq(contacts.id, input.requesterId));
  if (!requester) return { via: "none", reason: "no_requester" };

  /*
   * The guard that stops a derived address from ever reaching a mail server.
   * `.invalid` is reserved by RFC 2606 precisely so that it cannot resolve, and
   * a ticket can carry one whenever a channel has no email — today WhatsApp,
   * tomorrow anything else.
   */
  if (requester.email.endsWith("@whatsapp.invalid")) {
    return { via: "none", reason: "unroutable_address" };
  }

  try {
    const sent = await sendTicketReplyEmail({
      tenantId: input.tenantId,
      ticketNumber: input.ticketNumber,
      subject: input.subject,
      to: requester.email,
      bodyText: input.bodyText,
    });
    if (sent?.messageId) {
      await db
        .update(ticketMessages)
        .set({ emailMeta: { messageId: sent.messageId } })
        .where(eq(ticketMessages.id, input.messageId));
    }
    return { via: "email", messageId: sent?.messageId };
  } catch (err) {
    // A send failure does not block the reply — it shows up in the log (ST-03).
    console.error("[mail] failed to send the reply:", err);
    return { via: "email" };
  }
}

async function deliverWhatsapp(input: DeliverInput): Promise<DeliverOutcome> {
  try {
    const { sendMessageToWhatsapp } = await import("@openhelpdesk/whatsapp");
    const result = await sendMessageToWhatsapp(input.tenantId, input.messageId);

    if (result.outcome === "out_of_window") {
      await systemEvent(
        input.tenantId,
        input.ticketId,
        result.closesAt
          ? `WhatsApp did not accept this reply: the 24-hour service window closed at ${result.closesAt.toISOString()}. A pre-approved template is required until the customer writes again.`
          : "WhatsApp did not accept this reply: the customer has never written, so no service window is open.",
      );
      return { via: "whatsapp", sent: false, outOfWindow: true };
    }
    if (result.outcome === "failed") {
      await systemEvent(input.tenantId, input.ticketId, `WhatsApp refused this reply: ${result.error}`);
      return { via: "whatsapp", sent: false, outOfWindow: false };
    }
    return { via: "whatsapp", sent: result.outcome === "sent", outOfWindow: false };
  } catch (err) {
    console.error("[whatsapp] failed to send the reply:", err);
    await systemEvent(
      input.tenantId,
      input.ticketId,
      "WhatsApp delivery failed. The reply is recorded here but the customer has not received it.",
    );
    return { via: "whatsapp", sent: false, outOfWindow: false };
  }
}

/**
 * A system event in the thread.
 *
 * In English, and deliberately: it is persisted, and a package or a server
 * action cannot reach the translation dictionaries at write time. The same rule
 * already applies to the fallback subject of an inbound email.
 */
async function systemEvent(tenantId: string, ticketId: string, text: string): Promise<void> {
  await db.insert(ticketMessages).values({
    tenantId,
    ticketId,
    kind: "system_event",
    authorType: "system",
    bodyText: text,
  });
}
