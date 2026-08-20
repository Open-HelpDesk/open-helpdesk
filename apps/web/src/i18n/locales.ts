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
  // Les 24 langues officielles de l'Union européenne…
  | "bg" | "cs" | "da" | "de" | "el" | "en" | "es" | "et" | "fi" | "fr"
  | "ga" | "hr" | "hu" | "it" | "lt" | "lv" | "mt" | "nl" | "pl" | "pt"
  | "ro" | "sk" | "sl" | "sv"
  // …plus le norvégien, hors UE, conservé depuis la première livraison.
  | "nb";

export type LocaleDefinition = {
  code: LocaleCode;
  /** Étiquette BCP-47 pour Intl.* */
  tag: string;
  /** Nom de la langue dans cette langue — un menu de langues ne se traduit pas. */
  nativeName: string;
  dir: "ltr" | "rtl";
};

/**
 * Les 24 langues officielles de l'UE couvrent ses 27 pays : chaque État membre a
 * au moins une de ces langues comme langue officielle. Le norvégien s'y ajoute,
 * hors UE, parce qu'il était livré avant.
 *
 * Aucune ne s'écrit de droite à gauche — le maltais, seule langue sémitique de
 * la liste, s'écrit en alphabet latin. `dir` reste déclaré pour que l'ajout
 * d'une langue RTL soit un travail de traduction et non de mise en page.
 */
export const LOCALES: readonly LocaleDefinition[] = [
  { code: "bg", tag: "bg-BG", nativeName: "Български", dir: "ltr" },
  { code: "cs", tag: "cs-CZ", nativeName: "Čeština", dir: "ltr" },
  { code: "da", tag: "da-DK", nativeName: "Dansk", dir: "ltr" },
  { code: "de", tag: "de-DE", nativeName: "Deutsch", dir: "ltr" },
  { code: "el", tag: "el-GR", nativeName: "Ελληνικά", dir: "ltr" },
  { code: "en", tag: "en-GB", nativeName: "English", dir: "ltr" },
  { code: "es", tag: "es-ES", nativeName: "Español", dir: "ltr" },
  { code: "et", tag: "et-EE", nativeName: "Eesti", dir: "ltr" },
  { code: "fi", tag: "fi-FI", nativeName: "Suomi", dir: "ltr" },
  { code: "fr", tag: "fr-FR", nativeName: "Français", dir: "ltr" },
  { code: "ga", tag: "ga-IE", nativeName: "Gaeilge", dir: "ltr" },
  { code: "hr", tag: "hr-HR", nativeName: "Hrvatski", dir: "ltr" },
  { code: "hu", tag: "hu-HU", nativeName: "Magyar", dir: "ltr" },
  { code: "it", tag: "it-IT", nativeName: "Italiano", dir: "ltr" },
  { code: "lt", tag: "lt-LT", nativeName: "Lietuvių", dir: "ltr" },
  { code: "lv", tag: "lv-LV", nativeName: "Latviešu", dir: "ltr" },
  { code: "mt", tag: "mt-MT", nativeName: "Malti", dir: "ltr" },
  { code: "nb", tag: "nb-NO", nativeName: "Norsk bokmål", dir: "ltr" },
  { code: "nl", tag: "nl-NL", nativeName: "Nederlands", dir: "ltr" },
  { code: "pl", tag: "pl-PL", nativeName: "Polski", dir: "ltr" },
  { code: "pt", tag: "pt-PT", nativeName: "Português", dir: "ltr" },
  { code: "ro", tag: "ro-RO", nativeName: "Română", dir: "ltr" },
  { code: "sk", tag: "sk-SK", nativeName: "Slovenčina", dir: "ltr" },
  { code: "sl", tag: "sl-SI", nativeName: "Slovenščina", dir: "ltr" },
  { code: "sv", tag: "sv-SE", nativeName: "Svenska", dir: "ltr" },
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
