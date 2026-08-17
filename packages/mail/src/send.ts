/**
 * Réponse d'agent → email au demandeur. Le numéro dans le sujet ([#N]) sert de repli de
 * threading côté ingestion ; le Message-ID renvoyé est stocké dans email_meta.
 *
 * L'envoi passe par la boîte d'envoi (journal + file + retries) : voir outbox.ts.
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
