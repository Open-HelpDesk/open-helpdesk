/**
 * Mécanique de traduction : types, sélection de pluriel, interpolation.
 *
 * Le français est la source. `fr.ts` définit l'ensemble des clés ; les autres
 * langues sont typées `Dictionary` sur cet ensemble, si bien qu'une clé oubliée
 * ou en trop est une erreur de compilation et non un texte anglais qui
 * réapparaît en production.
 *
 * Une valeur est soit une chaîne, soit une table de formes de pluriel. Les
 * formes sont celles d'`Intl.PluralRules` pour la langue : `one`/`other` en
 * allemand ou en néerlandais, `one`/`many`/`other` en français. On fournit
 * toujours `other` — c'est le repli quand la catégorie exacte manque.
 */

import type { PluralCategory } from "./format";

export type Message = string | ({ other: string } & Partial<Record<PluralCategory, string>>);

export type MessageParams = Record<string, string | number>;

/**
 * Remplace {nom} par sa valeur. Un paramètre absent laisse l'accolade visible,
 * ce qui saute aux yeux en relecture au lieu de produire un trou silencieux.
 *
 * Un paramètre NUMÉRIQUE est mis en forme dans la langue courante : « 4 128 »
 * en français, « 4,128 » en anglais, « 4.128 » en allemand. Sans cela, un
 * `String(n)` rendait « 4128 » partout et faisait perdre le séparateur de
 * milliers que les anciens helpers `numberFr` posaient.
 *
 * Un nombre qui ne doit PAS être groupé — une année, un numéro de version —
 * se passe donc en chaîne : `{ year: String(2026) }`.
 */
function interpolate(
  template: string,
  params?: MessageParams,
  formatNumber?: (n: number) => string,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!(key in params)) return whole;
    const value = params[key];
    return typeof value === "number" && formatNumber ? formatNumber(value) : String(value);
  });
}

export function selectMessage(
  message: Message,
  category: PluralCategory | undefined,
): string {
  if (typeof message === "string") return message;
  return (category && message[category]) || message.other;
}

export function renderMessage(
  message: Message,
  params: MessageParams | undefined,
  category: PluralCategory | undefined,
  formatNumber?: (n: number) => string,
): string {
  return interpolate(selectMessage(message, category), params, formatNumber);
}

/**
 * Découpe une phrase traduite autour d'un paramètre rendu en JSX (un lien, une
 * référence en gras). Rendre `t("…", { ref: <b/> })` est impossible — une
 * traduction est une chaîne — et couper la phrase en deux clés casserait
 * l'ordre des mots des autres langues. On interpole donc un séparateur
 * improbable, puis on redécoupe.
 */
const SLOT = "\u0000";

export function splitAround(
  render: (params: MessageParams) => string,
  slot: string,
  params?: MessageParams,
): [string, string] {
  const whole = render({ ...params, [slot]: SLOT });
  const at = whole.indexOf(SLOT);
  if (at === -1) return [whole, ""];
  return [whole.slice(0, at), whole.slice(at + SLOT.length)];
}
