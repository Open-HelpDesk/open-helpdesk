/**
 * Localised formats — replaces the portal's `*Fr` helpers.
 *
 * Everything that can be delegated to `Intl` is: dates, times, numbers,
 * plurals, relative time. What is left ("for 3 days") depends on grammar and
 * therefore lives in the dictionaries, not here.
 *
 * Two pitfalls this module closes:
 *  - `Intl.RelativeTimeFormat(..., { numeric: "auto" })` renders "yesterday" / "tomorrow"
 *    on its own; writing them by hand meant a special case per language.
 *  - plurals are not "n > 1" everywhere. French puts 0 in the singular, English
 *    in the plural, and Welsh has six categories. `Intl.PluralRules` picks the
 *    right form; the dictionaries supply them all.
 */

import type { LocaleDefinition } from "./locales";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type PluralCategory = Intl.LDMLPluralRule;

export class LocaleFormat {
  readonly locale: LocaleDefinition;
  readonly #tag: string;
  #plural?: Intl.PluralRules;
  #relative?: Intl.RelativeTimeFormat;
  #number?: Intl.NumberFormat;

  constructor(locale: LocaleDefinition) {
    this.locale = locale;
    this.#tag = locale.tag;
  }

  /** Plural category for this number in this language (one, other, many…). */
  plural(n: number): PluralCategory {
    this.#plural ??= new Intl.PluralRules(this.#tag);
    return this.#plural.select(n);
  }

  /** "4 128" / "4,128" / "4.128" depending on the language. */
  number(n: number): string {
    this.#number ??= new Intl.NumberFormat(this.#tag);
    return this.#number.format(n);
  }

  /** "3 hours ago", "yesterday", "2 weeks ago". Switches to a date beyond one year. */
  relative(date: Date, now: Date = new Date()): string {
    this.#relative ??= new Intl.RelativeTimeFormat(this.#tag, { numeric: "auto" });
    const diff = Math.max(0, now.getTime() - date.getTime());
    if (diff < MIN) return this.#relative.format(0, "second");
    if (diff < HOUR) return this.#relative.format(-Math.floor(diff / MIN), "minute");
    if (diff < DAY) return this.#relative.format(-Math.floor(diff / HOUR), "hour");
    const days = Math.floor(diff / DAY);
    if (days < 7) return this.#relative.format(-days, "day");
    if (days < 30) return this.#relative.format(-Math.floor(days / 7), "week");
    const months = Math.floor(days / 30);
    if (months < 12) return this.#relative.format(-months, "month");
    return this.dateLong(date);
  }

  /** Gap in whole units, for the dictionaries' "for …" phrasings. */
  elapsed(date: Date, now: Date = new Date()): { unit: "minute" | "hour" | "day" | "date"; n: number } {
    const diff = Math.max(0, now.getTime() - date.getTime());
    if (diff < HOUR) return { unit: "minute", n: Math.max(1, Math.floor(diff / MIN)) };
    if (diff < DAY) return { unit: "hour", n: Math.floor(diff / HOUR) };
    const days = Math.floor(diff / DAY);
    if (days < 30) return { unit: "day", n: days };
    return { unit: "date", n: days };
  }

  /**
   * Proper noun preceded by its genitive preposition, when that preposition
   * depends on the phonetics of the word that follows. French elides ("le
   * support d'Acme", "le support de Nordfil"): no CLDR data covers this case, it
   * has to be handled per language.
   *
   * Every other language receives the name AS IS, and that is a contract their
   * dictionaries each honour in their own way: an invariable preposition
   * ("ó {org}" in Irish), a common noun inserted in front so that the proper
   * noun stays in the nominative ("Kontakty organizace {org}" in Czech, "του
   * οργανισμού {org}" in Greek), a two-form article ("A(z) {org}" in
   * Hungarian), or a reworded sentence that avoids the case entirely (Latvian).
   *
   * What no language can do is decline the name: the product inserts a raw
   * "Acme", with no way to build its genitive. A translation requiring one would
   * produce a faulty sentence on every display.
   */
  of(name: string): string {
    if (this.locale.code !== "fr") return name;
    return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? `d'${name}` : `de ${name}`;
  }

  /** "14 August 2026" / "14. August 2026" / "14 de agosto de 2026". */
  dateLong(date: Date): string {
    return date.toLocaleDateString(this.#tag, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /** "14 August" — without the year. */
  dateShort(date: Date): string {
    return date.toLocaleDateString(this.#tag, { day: "numeric", month: "long" });
  }

  /** "09:12" if the message is from today, otherwise "14 Aug, 09:12". */
  messageTime(date: Date, now: Date = new Date()): string {
    const hm = date.toLocaleTimeString(this.#tag, { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) return hm;
    const d = date.toLocaleDateString(this.#tag, { day: "numeric", month: "short" });
    return `${d}, ${hm}`;
  }
}

/* ---------- Language-independent helpers ----------
 * Initials, short name, first name: they handle the name a person typed in, not
 * translatable text. They used to carry an `Fr` suffix out of habit; they must
 * above all not be translated. */

/** "Julien Lambert" → JL. */
export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return letters || "?";
}

export function displayName(name: string | null, email: string): string {
  return name?.trim() || email.split("@")[0]!;
}

/** "Julien L." — user pill in the chrome. */
export function shortName(name: string | null, email: string): string {
  const dn = displayName(name, email);
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return dn;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** First name alone — "Reply from Marie". */
export function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

/** Reading time ≈ 200 words/min, minimum 1. */
export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
