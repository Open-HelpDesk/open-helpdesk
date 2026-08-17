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
  replyTo?: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

export interface MailTransport {
  send(mail: OutgoingEmail): Promise<{ messageId?: string }>;
  /** Test de configuration sans envoyer d'email (connexion SMTP, validité de la clé). */
  verify?(): Promise<{ ok: boolean; detail: string }>;
}

/** Nature de l'email, pour le journal d'envoi (ST-03). */
export type MailKind =
  | "ticket_reply"
  | "csat"
  | "magic_link"
  | "rule"
  | "invitation"
  | "test"
  | "other";
