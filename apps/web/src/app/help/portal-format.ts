/**
 * Ce qui reste propre au portail après la mise en langues.
 *
 * Les quinze helpers `*Fr` d'origine ont été remplacés : les formats de date,
 * de nombre, de pluriel et de temps relatif vivent dans `@/i18n/format`, les
 * phrases dans les dictionnaires. Il ne subsiste ici que l'extrait d'article,
 * qui découpe du texte sans jamais le traduire.
 */

import { parseArticle, parseInline } from "@/lib/article-format";
import type { MessageKey } from "@/i18n/dictionaries/fr";

/**
 * Extrait d'un corps d'article : le premier paragraphe réel, sans balisage.
 * S'appuie sur l'analyseur partagé pour ne pas réinterpréter le format en double
 * (une liste ou un sous-titre ne doit pas ressortir avec ses tirets).
 */
export function excerpt(body: string | null, max = 180): string {
  if (!body) return "";
  const bloc = parseArticle(body).find((b) => b.type === "p");
  if (!bloc || bloc.type !== "p") return "";
  const text = parseInline(bloc.text)
    .map((t) => t.text)
    .join("");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}

/**
 * Statut technique du ticket → clé de traduction, dans le vocabulaire client.
 * « nouveau », « ouvert » et « en pause » se disent tous « en cours » côté
 * client : le détail du pipeline interne ne le regarde pas.
 */
export function statusKey(status: string): MessageKey {
  if (status === "waiting") return "status.waiting";
  if (status === "resolved") return "status.resolved";
  if (status === "closed") return "status.closed";
  return "status.open";
}
