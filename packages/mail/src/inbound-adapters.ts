/**
 * Adapters for the providers' inbound webhooks (ST-03).
 *
 * Each provider POSTs its own format; everything converges towards InboundEmail before
 * ingestion. Defensive parsing: a missing field produces an ignored email, never an
 * exception — a webhook answering 500 is replayed in a loop by the provider.
 *
 * - Brevo "Inbound parsing" : POST { items: [ { From, To, Subject, RawTextBody… } ] }
 * - Mailjet "Parse API"     : flat POST { From, Recipient, Subject, Text-part… }
 */
import type { InboundEmail } from "./types";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** "Name <a@b.fr>" → { address, name }; "a@b.fr" accepted as-is. */
function parseAddress(value: unknown): { address: string; name?: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  const address = (match?.[2] ?? value).trim().toLowerCase();
  if (!address.includes("@")) return null;
  const name = match?.[1]?.trim();
  return { address, name: name || undefined };
}

function parseReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((r): r is string => typeof r === "string");
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

/** All the provider headers, keys lowercased (detection of automatic messages). */
function lowerHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value === "string") out[key.toLowerCase()] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[key.toLowerCase()] = value[0];
  }
  return out;
}

/** Provider headers: case and shape vary ("Message-Id", "message-id", arrays). */
function header(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== wanted) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return undefined;
}

/* ---------- Brevo — Inbound parsing ---------- */

type BrevoItem = {
  From?: { Address?: string; Name?: string };
  To?: { Address?: string; Name?: string }[];
  Subject?: string;
  RawTextBody?: string;
  ExtractedMarkdownMessage?: string;
  RawHtmlBody?: string;
  MessageId?: string;
  InReplyTo?: string;
  Headers?: Record<string, unknown>;
};

export function parseBrevoInbound(body: unknown): InboundEmail[] {
  const items = (body as { items?: BrevoItem[] } | null)?.items;
  if (!Array.isArray(items)) return [];

  const emails: InboundEmail[] = [];
  for (const item of items) {
    const fromAddress = str(item.From?.Address)?.toLowerCase();
    if (!fromAddress) continue;
    const to = (item.To ?? [])
      .map((t) => str(t.Address)?.toLowerCase())
      .filter((a): a is string => Boolean(a));
    if (to.length === 0) continue;
    emails.push({
      to,
      from: { address: fromAddress, name: str(item.From?.Name) },
      subject: item.Subject ?? "",
      text: str(item.RawTextBody) ?? str(item.ExtractedMarkdownMessage),
      html: str(item.RawHtmlBody),
      messageId: str(item.MessageId) ?? header(item.Headers, "message-id"),
      inReplyTo: str(item.InReplyTo) ?? header(item.Headers, "in-reply-to"),
      references: parseReferences(header(item.Headers, "references")),
      headers: lowerHeaders(item.Headers),
    });
  }
  return emails;
}

/* ---------- Mailjet — Parse API ---------- */

type MailjetPayload = {
  From?: string;
  Sender?: string;
  Recipient?: string;
  Subject?: string;
  ["Text-part"]?: string;
  ["Html-part"]?: string;
  Headers?: Record<string, unknown>;
};

export function parseMailjetInbound(body: unknown): InboundEmail[] {
  const payload = body as MailjetPayload | null;
  if (!payload || typeof payload !== "object") return [];

  const from =
    parseAddress(payload.From) ??
    parseAddress(header(payload.Headers, "from")) ??
    parseAddress(payload.Sender);
  const recipient = str(payload.Recipient)?.toLowerCase();
  if (!from || !recipient) return [];

  return [
    {
      to: [recipient],
      from,
      subject: payload.Subject ?? header(payload.Headers, "subject") ?? "",
      text: str(payload["Text-part"]),
      html: str(payload["Html-part"]),
      messageId: header(payload.Headers, "message-id"),
      inReplyTo: header(payload.Headers, "in-reply-to"),
      references: parseReferences(header(payload.Headers, "references")),
      headers: lowerHeaders(payload.Headers),
    },
  ];
}
