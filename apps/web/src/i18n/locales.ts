/**
 * Langues du logiciel — specs/01 § 4 (tenants.locale).
 *
 * Une langue par tenant : tout le monde dans un espace de travail voit la même,
 * agents comme clients. Il n'y a donc ni préférence par utilisateur, ni préfixe
 * d'URL, ni négociation de contenu — la seule source est `tenants.locale`,
 * réglée dans ST-01.
 *
 * `tag` est l'étiquette BCP-47 passée aux API `Intl` : elle porte les
 * conventions de date, de nombre et de pluriel. `dir` est déclaré dès
 * maintenant pour que la mise en page n'ait pas à être reprise le jour où une
 * langue écrite de droite à gauche s'ajoute ; aucune des langues actuelles n'en
 * fait usage.
 */

export type LocaleCode =
  | "fr"
  | "en"
  | "de"
  | "it"
  | "es"
  | "pt"
  | "nl"
  | "sv"
  | "fi"
  | "da"
  | "nb";

export type LocaleDefinition = {
  code: LocaleCode;
  /** Étiquette BCP-47 pour Intl.* */
  tag: string;
  /** Nom de la langue dans cette langue — un menu de langues ne se traduit pas. */
  nativeName: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: readonly LocaleDefinition[] = [
  { code: "fr", tag: "fr-FR", nativeName: "Français", dir: "ltr" },
  { code: "en", tag: "en-GB", nativeName: "English", dir: "ltr" },
  { code: "de", tag: "de-DE", nativeName: "Deutsch", dir: "ltr" },
  { code: "it", tag: "it-IT", nativeName: "Italiano", dir: "ltr" },
  { code: "es", tag: "es-ES", nativeName: "Español", dir: "ltr" },
  { code: "pt", tag: "pt-PT", nativeName: "Português", dir: "ltr" },
  { code: "nl", tag: "nl-NL", nativeName: "Nederlands", dir: "ltr" },
  { code: "sv", tag: "sv-SE", nativeName: "Svenska", dir: "ltr" },
  { code: "fi", tag: "fi-FI", nativeName: "Suomi", dir: "ltr" },
  { code: "da", tag: "da-DK", nativeName: "Dansk", dir: "ltr" },
  { code: "nb", tag: "nb-NO", nativeName: "Norsk bokmål", dir: "ltr" },
] as const;

export const DEFAULT_LOCALE: LocaleCode = "fr";

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && BY_CODE.has(value as LocaleCode);
}

/** Normalise ce qui vient de la base ou d'un formulaire ; retombe sur le français. */
export function resolveLocale(value: unknown): LocaleDefinition {
  return BY_CODE.get(isLocaleCode(value) ? value : DEFAULT_LOCALE)!;
}
