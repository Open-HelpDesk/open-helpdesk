/**
 * The shape an import reads, and the shape it reports.
 *
 * Deliberately not Zendesk's shape: an adapter turns each product's export into
 * this, so the writer stays the same whatever the source. Zendesk today,
 * Freshdesk next — the writer is the expensive part and it should be written
 * once.
 */
import type { importSource } from "@openhelpdesk/db";

export type ImportSource = (typeof importSource.enumValues)[number];

export type SourceOrganization = {
  externalId: string;
  name: string;
  emailDomains?: string[];
  notes?: string | null;
};

export type SourceContact = {
  externalId: string;
  email: string | null;
  name?: string | null;
  phone?: string | null;
  organizationExternalId?: string | null;
  createdAt?: Date | null;
};

/**
 * A file the source only *names*: Zendesk hands out a URL, not the bytes.
 * Fetching it is a separate, authenticated round trip — see fetchAttachments.
 */
export type SourceAttachment = {
  filename: string;
  contentType?: string | null;
  url: string;
  sizeBytes?: number | null;
};

export type SourceMessage = {
  externalId: string;
  /** Null when the author cannot be resolved — the message still lands. */
  authorExternalId: string | null;
  /** True for what Zendesk calls a private comment. */
  internal: boolean;
  bodyText: string | null;
  bodyHtml: string | null;
  createdAt: Date;
  attachments?: SourceAttachment[];
};

export type SourceTicket = {
  externalId: string;
  /** The number the customer knows. Kept, which is the whole point. */
  number: number | null;
  subject: string;
  status: "new" | "open" | "waiting" | "on_hold" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  requesterExternalId: string | null;
  organizationExternalId?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date | null;
  firstRepliedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  messages: SourceMessage[];
};

/** What an adapter hands the writer. */
export type SourceExport = {
  source: ImportSource;
  organizations: SourceOrganization[];
  contacts: SourceContact[];
  tickets: SourceTicket[];
};

/**
 * Something that could not be brought across, in the customer's terms.
 *
 * `kind` is a stable code so the interface can translate it; `detail` names the
 * row so the customer can go and look. Never a raw exception string: an import
 * report is read by the person who is deciding whether to trust us.
 */
export type Anomaly = {
  kind:
    | "contact_without_email"
    | "ticket_without_requester"
    | "duplicate_number"
    | "unmapped_status"
    | "unmapped_priority"
    | "message_without_body"
    | "attachment_too_large"
    | "attachment_unreachable"
    | "write_failed";
  object: "organization" | "contact" | "ticket" | "message" | "attachment";
  externalId: string;
  detail?: string;
};

export type ObjectCounts = {
  seen: number;
  created: number;
  skipped: number;
  failed: number;
};

export type ImportReport = {
  organizations: ObjectCounts;
  contacts: ObjectCounts;
  tickets: ObjectCounts;
  messages: ObjectCounts;
  attachments: ObjectCounts;
  anomalies: Anomaly[];
};

export function emptyCounts(): ObjectCounts {
  return { seen: 0, created: 0, skipped: 0, failed: 0 };
}

export function emptyReport(): ImportReport {
  return {
    organizations: emptyCounts(),
    contacts: emptyCounts(),
    tickets: emptyCounts(),
    messages: emptyCounts(),
    attachments: emptyCounts(),
    anomalies: [],
  };
}
