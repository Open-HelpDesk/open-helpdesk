/**
 * The shapes the WhatsApp Cloud API actually sends, narrowed to what we use.
 *
 * Deliberately not a full model of Meta's payload: it changes, it carries
 * fields we have no business reading, and a type that claims to describe all of
 * it would be a lie maintained by hand. What is typed here is what the ingest
 * reads, and everything is optional because Meta omits rather than nulls.
 */

/** A message as it arrives in `entry[].changes[].value.messages[]`. */
export type InboundMessage = {
  /** `wamid.…` — the deduplication key. Meta retries until it gets a 200. */
  id: string;
  /** Sender, digits only, no plus sign. */
  from: string;
  /** Unix seconds, as a string. */
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  /** Media kinds all carry an id we then have to fetch separately. */
  image?: MediaRef;
  document?: MediaRef & { filename?: string };
  audio?: MediaRef;
  video?: MediaRef;
  sticker?: MediaRef;
  /** Button and list replies — a tap, not typing. */
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  /** Present when the customer replies to a specific message. */
  context?: { id?: string };
};

export type MediaRef = { id?: string; mime_type?: string; sha256?: string; caption?: string };

export type InboundContactProfile = {
  wa_id?: string;
  profile?: { name?: string };
};

export type ChangeValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    /** The only thing in the payload that says which workspace this is. */
    phone_number_id?: string;
  };
  contacts?: InboundContactProfile[];
  messages?: InboundMessage[];
  /** Delivery and read receipts. We record failures, we ignore the rest. */
  statuses?: Array<{
    id?: string;
    status?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
  }>;
};

export type WebhookEnvelope = {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: ChangeValue }> }>;
};

/** What the ingest reports. Mirrors the mail pipeline's own result on purpose. */
export type IngestOutcome =
  | { outcome: "created"; ticketId: string; number: number; tenantId: string }
  | { outcome: "appended"; ticketId: string; number: number; tenantId: string }
  | { outcome: "ignored"; reason: IgnoreReason }
  | { outcome: "rejected"; reason: RejectReason };

export type IgnoreReason =
  /** Already ingested — a webhook retry, which is the normal case. */
  | "duplicate"
  /** A delivery or read receipt, not a message. */
  | "status_only"
  /** A kind we do not turn into a ticket (reactions, system notices). */
  | "unsupported_type"
  /** No text and no media: nothing a human could act on. */
  | "empty";

export type RejectReason =
  /** No workspace owns this phone_number_id. */
  | "unknown_number"
  /** The channel exists but is switched off. */
  | "inactive"
  /** The contact is blocked in the workspace. */
  | "blocked_sender";

/** Resolved, decrypted configuration for one workspace. */
export type WhatsappConfig = {
  tenantId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  defaultTeamId: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
};
