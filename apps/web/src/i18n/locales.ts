/**
 * Languages of the software — one per workspace (tenants.locale).
 *
 * One language per tenant: everyone in a workspace sees the same one, agents and
 * customers alike. So there is no per-user preference, no URL prefix and no
 * content negotiation — the only source is `tenants.locale`, set in ST-01.
 *
 * `tag` is the BCP-47 label passed to the `Intl` APIs: it carries the date,
 * number and plural conventions. `dir` is declared right now so that the layout
 * will not have to be reworked the day a language written from right to left is
 * added; none of the current languages makes use of it.
 */

export type LocaleCode =
  // The 24 official languages of the European Union…
  | "bg" | "cs" | "da" | "de" | "el" | "en" | "es" | "et" | "fi" | "fr"
  | "ga" | "hr" | "hu" | "it" | "lt" | "lv" | "mt" | "nl" | "pl" | "pt"
  | "ro" | "sk" | "sl" | "sv"
  // …plus Norwegian, outside the EU, kept since the first release.
  | "nb";

export type LocaleDefinition = {
  code: LocaleCode;
  /** BCP-47 label for Intl.* */
  tag: string;
  /** Name of the language in that language — a language menu is not translated. */
  nativeName: string;
  dir: "ltr" | "rtl";
};

/**
 * The 24 official EU languages cover its 27 countries: every member state has at
 * least one of them as an official language. Norwegian is added to them, outside
 * the EU, because it shipped earlier.
 *
 * None of them is written from right to left — Maltese, the only Semitic
 * language on the list, is written in the Latin alphabet. `dir` stays declared
 * so that adding an RTL language is translation work and not layout work.
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

export const DEFAULT_LOCALE: LocaleCode = "en";

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && BY_CODE.has(value as LocaleCode);
}

/** Normalises what comes from the database or from a form; falls back to French. */
export function resolveLocale(value: unknown): LocaleDefinition {
  return BY_CODE.get(isLocaleCode(value) ? value : DEFAULT_LOCALE)!;
}
