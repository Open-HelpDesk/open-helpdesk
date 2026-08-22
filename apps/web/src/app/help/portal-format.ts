/**
 * What remains portal-specific after the move to multiple languages.
 *
 * The original fifteen `*Fr` helpers have been replaced: the date, number,
 * plural and relative time formats live in `@/i18n/format`, the sentences in
 * the dictionaries. All that is left here is the article excerpt, which slices
 * text without ever translating it.
 */

import { parseArticle, parseInline } from "@/lib/article-format";
import type { MessageKey } from "@/i18n/dictionaries/en";

/**
 * Excerpt of an article body: the first real paragraph, without markup.
 * Relies on the shared parser so as not to reinterpret the format twice
 * (a list or a subheading must not come out with its dashes).
 */
export function excerpt(body: string | null, max = 180): string {
  if (!body) return "";
  const block = parseArticle(body).find((b) => b.type === "p");
  if (!block || block.type !== "p") return "";
  const text = parseInline(block.text)
    .map((t) => t.text)
    .join("");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}

/**
 * Technical ticket status → translation key, in the customer's vocabulary.
 * "new", "open" and "on hold" are all called "in progress" on the customer
 * side: the detail of the internal pipeline is none of their concern.
 */
export function statusKey(status: string): MessageKey {
  if (status === "waiting") return "status.waiting";
  if (status === "resolved") return "status.resolved";
  if (status === "closed") return "status.closed";
  return "status.open";
}
