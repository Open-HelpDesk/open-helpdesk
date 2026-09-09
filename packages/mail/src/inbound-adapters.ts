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
import { parseAddress as splitDisplayAddress } from "./address";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** "Name <a@b.fr>" → { address, name }; "a@b.fr" accepted as-is. */
function parseAddress(value: unknown): { address: string; name?: string } | null {
  if (typeof value !== "string") return null;
  const parsed = splitDisplayAddress(value);
  const address = parsed.email.toLowerCase();
  if (!address.includes("@")) return null;
  return { address, name: parsed.name };
}

function parseReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((r): r is string => typeof r === "string");
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * All the provider headers, keys lowercased (detection of automatic messages).
 *
 * **`Object.create(null)` et non `{}`.** Les clés viennent des en-têtes d'un
 * email entrant, donc d'un tiers : écrire `out[key.toLowerCase()]` sur un objet
 * ordinaire, c'est laisser un expéditeur choisir un nom de propriété
 * (`js/remote-property-injection`). Un objet sans prototype rend la question
 * sans objet — aucune clé ne peut atteindre `__proto__` ni `constructor`,
 * puisqu'il n'y en a pas.
 *
 * Et cela corrige un second travers plus discret : sur un objet ordinaire, une
 * lecture comme `h["toString"]` rendait une fonction héritée au lieu de
 * `undefined`, donc un en-tête absent pouvait passer pour présent.
 */
/**
 * Des noms qu'aucun en-tête d'email légitime ne porte, et qui ne sont écartés
 * qu'en correspondance exacte : `X-Constructor-Id` passe, `constructor` non.
 *
 * Le prototype nul suffit déjà à la sûreté — aucune clé ne peut atteindre ce
 * qui n'existe pas. Ce filtre est donc redondant de ce point de vue, et il est
 * là pour deux autres raisons : un en-tête nommé `__proto__` est une entrée
 * malformée qu'on a raison de jeter plutôt que de stocker, et l'intention est
 * lisible — par le prochain lecteur, et par l'analyseur statique, qui ne
 * reconnaît pas `Object.create(null)` comme une protection.
 */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/*
 * Pourquoi ce n'est PAS une `Map`, alors que c'est la première chose que
 * recommande la règle `js/remote-property-injection`.
 *
 * `InboundEmail` traverse la file BullMQ `mail-ingest` (`job.data as
 * InboundEmail` dans le worker), donc passe par JSON. Une `Map` s'y sérialise
 * en `{}` : tous les en-têtes disparaîtraient en silence, et avec eux la
 * détection des rebonds, celle des réponses automatiques et le verdict de
 * spam. Ce serait une régression fonctionnelle pour satisfaire un analyseur.
 *
 * L'autre correctif que la règle propose — préfixer la clé d'un `$` — casserait
 * toutes les lectures (`h["content-type"]`) chez chaque appelant.
 *
 * Ce qui protège réellement, et qui suffit : l'objet n'a pas de prototype, les
 * trois noms dangereux sont écartés en amont, et de l'autre côté de la file
 * c'est `JSON.parse` qui reconstruit l'objet — or il fait de `__proto__` une
 * propriété propre, jamais un prototype. Les deux alertes ont donc été écartées
 * en « false positive », avec ce raisonnement en commentaire de rejet.
 */

function lowerHeaders(headers: unknown): Record<string, string> {
  const out = Object.create(null) as Record<string, string>;
  if (!headers || typeof headers !== "object") return out;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    const name = key.toLowerCase();
    if (RESERVED_KEYS.has(name)) continue;
    if (typeof value === "string") out[name] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[name] = value[0];
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
