/**
 * Zendesk export → SourceExport.
 *
 * Reads what the Zendesk API returns (tickets, users, organizations, and the
 * comments of each ticket) and maps it onto our model. Parsing is defensive
 * throughout: an export is a file a customer hands us, often hand-assembled,
 * sometimes truncated. A missing field must produce a skipped row and a line in
 * the report — never an exception that loses the other 40 000 tickets.
 *
 * Where the two products disagree, the mapping loses information on purpose and
 * says so. `docs` on each function records the decision, because the customer
 * is told the same thing on the migration page and the two must not drift.
 */
import type {
  Anomaly,
  SourceAttachment,
  SourceContact,
  SourceExport,
  SourceMessage,
  SourceOrganization,
  SourceTicket,
} from "./types";

type Json = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function date(value: unknown): Date | null {
  const raw = str(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Json[]) : [];
}

/**
 * Zendesk status → ours.
 *
 * Zendesk's five map cleanly; anything else (a custom status, which Enterprise
 * plans allow) falls back to `open` rather than being dropped — a ticket in the
 * wrong column is recoverable, a ticket that never arrived is not.
 */
export function mapStatus(raw: string | null): {
  status: SourceTicket["status"];
  fallback: boolean;
} {
  switch ((raw ?? "").toLowerCase()) {
    case "new":
      return { status: "new", fallback: false };
    case "open":
      return { status: "open", fallback: false };
    case "pending":
      return { status: "waiting", fallback: false };
    case "hold":
      return { status: "on_hold", fallback: false };
    case "solved":
      return { status: "resolved", fallback: false };
    case "closed":
      return { status: "closed", fallback: false };
    default:
      return { status: "open", fallback: true };
  }
}

/** Zendesk priority → ours. An unset priority is normal, as it is there. */
export function mapPriority(raw: string | null): {
  priority: SourceTicket["priority"];
  fallback: boolean;
} {
  switch ((raw ?? "").toLowerCase()) {
    case "low":
      return { priority: "low", fallback: false };
    case "normal":
      return { priority: "normal", fallback: false };
    case "high":
      return { priority: "high", fallback: false };
    case "urgent":
      return { priority: "urgent", fallback: false };
    default:
      return { priority: "normal", fallback: raw !== null };
  }
}

/** Custom field values, keyed by field id — the ids are mapped later, by name. */
function customFields(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of list(raw)) {
    const id = num(entry["id"]);
    if (id === null) continue;
    const value = entry["value"];
    if (value === null || value === undefined || value === "") continue;
    out[String(id)] = value;
  }
  return out;
}

/** Zendesk names its files and gives a URL; the bytes come later. */
function parseAttachments(raw: unknown): SourceAttachment[] {
  const out: SourceAttachment[] = [];
  for (const entry of list(raw)) {
    // content_url is the authenticated one; mapped_content_url is its CDN
    // twin and is not always reachable with an API token.
    const url = str(entry["content_url"]) ?? str(entry["mapped_content_url"]);
    const filename = str(entry["file_name"]) ?? str(entry["filename"]);
    if (!url || !filename) continue;
    out.push({
      filename,
      contentType: str(entry["content_type"]),
      url,
      sizeBytes: num(entry["size"]),
    });
  }
  return out;
}

function parseComments(ticketId: string, raw: unknown, anomalies: Anomaly[]): SourceMessage[] {
  const messages: SourceMessage[] = [];
  for (const comment of list(raw)) {
    const id = num(comment["id"]);
    const created = date(comment["created_at"]);
    if (id === null || !created) continue;

    const bodyText = str(comment["plain_body"]) ?? str(comment["body"]);
    const bodyHtml = str(comment["html_body"]);
    const files = parseAttachments(comment["attachments"]);
    if (!bodyText && !bodyHtml && files.length === 0) {
      // Nothing at all to carry across: no text, no files.
      anomalies.push({
        kind: "message_without_body",
        object: "message",
        externalId: String(id),
        detail: `ticket ${ticketId}`,
      });
      continue;
    }

    messages.push({
      externalId: String(id),
      authorExternalId: num(comment["author_id"]) === null ? null : String(num(comment["author_id"])),
      // Zendesk marks a private comment with public: false.
      internal: comment["public"] === false,
      bodyText,
      bodyHtml,
      createdAt: created,
      attachments: files,
    });
  }
  return messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function parseZendeskExport(input: {
  tickets: unknown;
  users: unknown;
  organizations: unknown;
  /** Comments keyed by ticket id, as the API returns them one ticket at a time. */
  comments?: Record<string, unknown>;
}): { data: SourceExport; anomalies: Anomaly[] } {
  const anomalies: Anomaly[] = [];

  const organizations: SourceOrganization[] = [];
  for (const org of list(input.organizations)) {
    const id = num(org["id"]);
    const name = str(org["name"]);
    if (id === null || !name) continue;
    const domains = Array.isArray(org["domain_names"])
      ? (org["domain_names"] as unknown[])
          .map((d) => str(d)?.toLowerCase())
          .filter((d): d is string => Boolean(d))
      : [];
    organizations.push({
      externalId: String(id),
      name,
      emailDomains: domains,
      notes: str(org["details"]),
    });
  }

  const contacts: SourceContact[] = [];
  for (const user of list(input.users)) {
    const id = num(user["id"]);
    if (id === null) continue;
    // Agents come across as users, not contacts: only end-users become contacts.
    const role = str(user["role"]);
    if (role && role !== "end-user") continue;

    const email = str(user["email"])?.toLowerCase() ?? null;
    if (!email) {
      // Our contacts are keyed by email; a phone-only Zendesk user has nowhere
      // to go. Reported by name so the customer can decide what to do.
      anomalies.push({
        kind: "contact_without_email",
        object: "contact",
        externalId: String(id),
        detail: str(user["name"]) ?? undefined,
      });
      continue;
    }
    contacts.push({
      externalId: String(id),
      email,
      name: str(user["name"]),
      phone: str(user["phone"]),
      organizationExternalId:
        num(user["organization_id"]) === null ? null : String(num(user["organization_id"])),
      createdAt: date(user["created_at"]),
    });
  }

  const tickets: SourceTicket[] = [];
  for (const ticket of list(input.tickets)) {
    const id = num(ticket["id"]);
    const created = date(ticket["created_at"]);
    if (id === null || !created) continue;

    const { status, fallback: statusFallback } = mapStatus(str(ticket["status"]));
    if (statusFallback) {
      anomalies.push({
        kind: "unmapped_status",
        object: "ticket",
        externalId: String(id),
        detail: str(ticket["status"]) ?? undefined,
      });
    }
    const { priority, fallback: priorityFallback } = mapPriority(str(ticket["priority"]));
    if (priorityFallback) {
      anomalies.push({
        kind: "unmapped_priority",
        object: "ticket",
        externalId: String(id),
        detail: str(ticket["priority"]) ?? undefined,
      });
    }

    const requester = num(ticket["requester_id"]);
    if (requester === null) {
      anomalies.push({ kind: "ticket_without_requester", object: "ticket", externalId: String(id) });
      continue;
    }

    const comments = input.comments?.[String(id)] ?? ticket["comments"];
    tickets.push({
      externalId: String(id),
      number: id,
      subject: str(ticket["subject"]) ?? "(no subject)",
      status,
      priority,
      requesterExternalId: String(requester),
      organizationExternalId:
        num(ticket["organization_id"]) === null ? null : String(num(ticket["organization_id"])),
      tags: Array.isArray(ticket["tags"])
        ? (ticket["tags"] as unknown[]).map((t) => str(t)).filter((t): t is string => Boolean(t))
        : [],
      customFields: customFields(ticket["custom_fields"]),
      createdAt: created,
      updatedAt: date(ticket["updated_at"]),
      // Zendesk does not publish a first-reply timestamp on the ticket; it is
      // derived from the comments by the writer, which is more truthful anyway.
      firstRepliedAt: null,
      resolvedAt: status === "resolved" || status === "closed" ? date(ticket["updated_at"]) : null,
      closedAt: status === "closed" ? date(ticket["updated_at"]) : null,
      messages: parseComments(String(id), comments, anomalies),
    });
  }

  return { data: { source: "zendesk", organizations, contacts, tickets }, anomalies };
}
