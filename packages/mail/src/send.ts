/**
 * Agent reply → email to the requester. The number in the subject ([#N]) acts as the
 * threading fallback on the ingestion side; the Message-ID returned is stored in email_meta.
 *
 * The send goes through the outbox (log + queue + retries): see outbox.ts.
 */
import { sendTenantEmail } from "./outbox";

export async function sendTicketReplyEmail(params: {
  tenantId: string;
  ticketId?: string;
  ticketNumber: number;
  subject: string;
  to: string;
  bodyText: string;
}): Promise<{ messageId?: string; from: string } | null> {
  const result = await sendTenantEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Re: ${params.subject} [#${params.ticketNumber}]`,
    text: params.bodyText,
    kind: "ticket_reply",
    ticketId: params.ticketId,
  });
  return { messageId: result.messageId, from: result.from };
}
