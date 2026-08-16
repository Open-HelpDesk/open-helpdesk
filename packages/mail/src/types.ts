/**
 * Forme normalisée d'un email entrant — tous les transports (webhook Resend/SES en
 * cloud, poller IMAP en auto-hébergé) convergent vers ce format avant ingestion.
 */
export type InboundEmail = {
  /** Destinataires (enveloppe) — sert à résoudre la boîte, donc le tenant. */
  to: string[];
  from: { address: string; name?: string };
  subject: string;
  text?: string;
  html?: string;
  /** En-têtes de threading RFC 5322. */
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
};

export type IngestResult =
  | { outcome: "created"; ticketId: string; number: number; tenantId: string }
  | { outcome: "appended"; ticketId: string; number: number; tenantId: string }
  | { outcome: "rejected"; reason: "unknown_mailbox" | "loop" | "blocked_sender" | "empty" };

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

export interface MailTransport {
  send(mail: OutgoingEmail): Promise<{ messageId?: string }>;
}
