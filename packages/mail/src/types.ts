/**
 * Normalized shape of an inbound email — every transport (Resend/SES webhook on
 * control-plane deployments, IMAP poller when self-hosted) converges towards this
 * format before ingestion.
 */
export type InboundEmail = {
  /** Recipients (envelope) — used to resolve the mailbox, hence the tenant. */
  to: string[];
  from: { address: string; name?: string };
  subject: string;
  text?: string;
  html?: string;
  /** RFC 5322 threading headers. */
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  /**
   * Raw headers, lowercased — used to discard automatic messages
   * (Auto-Submitted RFC 3834, delivery failure reports). Optional: a
   * transport that does not provide them is still ingested normally.
   */
  headers?: Record<string, string>;
};

export type RejectionReason =
  | "unknown_mailbox"
  | "loop"
  | "blocked_sender"
  | "empty"
  | "bounce"
  | "auto_reply"
  | "spam";

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
  /** Configuration test without sending an email (SMTP connection, key validity). */
  verify?(): Promise<{ ok: boolean; detail: string }>;
}

/** Nature of the email, for the send log (ST-03). */
export type MailKind =
  | "ticket_reply"
  | "csat"
  | "magic_link"
  | "rule"
  | "invitation"
  | "test"
  | "other";
