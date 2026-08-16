/**
 * Envoi sortant — transport branchable : Resend si RESEND_API_KEY est défini,
 * sinon console (dev). SMTP arrive avec l'auto-hébergement complet.
 */
import { db, mailboxes } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import type { MailTransport, OutgoingEmail } from "./types";

export const consoleTransport: MailTransport = {
  async send(mail) {
    const messageId = `<dev-${Date.now()}-${Math.random().toString(36).slice(2)}@open-helpdesk.local>`;
    console.log(
      `[mail:console] à: ${mail.to} | de: ${mail.from} | sujet: ${mail.subject} | id: ${messageId}\n${mail.text.slice(0, 200)}`,
    );
    return { messageId };
  },
};

export function resendTransport(apiKey: string): MailTransport {
  return {
    async send(mail: OutgoingEmail) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mail.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          headers: mail.headers,
        }),
      });
      if (!res.ok) {
        throw new Error(`Resend ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { id?: string };
      return { messageId: data.id };
    },
  };
}

export function getTransport(): MailTransport {
  const key = process.env.RESEND_API_KEY;
  return key ? resendTransport(key) : consoleTransport;
}

/**
 * Réponse d'agent → email au demandeur. Le numéro dans le sujet ([#N]) sert de repli
 * de threading côté ingestion ; le Message-ID renvoyé est stocké dans email_meta.
 */
export async function sendTicketReplyEmail(params: {
  tenantId: string;
  ticketNumber: number;
  subject: string;
  to: string;
  bodyText: string;
}): Promise<{ messageId?: string; from: string } | null> {
  const [mailbox] = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.tenantId, params.tenantId))
    .limit(1);
  const from =
    mailbox?.senderName && mailbox.address
      ? `${mailbox.senderName} <${mailbox.address}>`
      : (mailbox?.address ?? process.env.MAIL_FROM ?? "support@open-helpdesk.local");

  const { messageId } = await getTransport().send({
    from,
    to: params.to,
    subject: `Re: ${params.subject} [#${params.ticketNumber}]`,
    text: params.bodyText,
  });
  return { messageId, from };
}
