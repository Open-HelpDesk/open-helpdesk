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
  /**
   * En-têtes bruts en minuscules — servent à écarter les messages automatiques
   * (Auto-Submitted RFC 3834, rapports de non-délivrance). Facultatif : un
   * transport qui ne les fournit pas reste ingéré normalement.
   */
  headers?: Record<string, string>;
};

export type RejectionReason =
  | "unknown_mailbox"
  | "loop"
  | "blocked_sender"
  | "empty"
  | "bounce"
  | "auto_reply";

export type IngestResult =
  | { outcome: "created"; ticketId: string; number: number; tenantId: string }
  | { outcome: "appended"; ticketId: string; number: number; tenantId: string }
  | { outcome: "rejected"; reason: RejectionReason };

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
