/**
 * Formats localisés — remplace les helpers `*Fr` du portail.
 *
 * Tout ce qui peut être délégué à `Intl` l'est : dates, heures, nombres,
 * pluriels, temps relatif. Ce qui reste (« depuis 3 jours ») dépend de la
 * grammaire et vit donc dans les dictionnaires, pas ici.
 *
 * Deux pièges que ce module referme :
 *  - `Intl.RelativeTimeFormat(..., { numeric: "auto" })` rend « hier » / « demain »
 *    tout seul ; les écrire à la main obligeait à un cas particulier par langue.
 *  - le pluriel n'est pas « n > 1 » partout. Le français met 0 au singulier,
 *    l'anglais au pluriel, et le gallois compte six catégories. `Intl.PluralRules`
 *    choisit la bonne forme ; les dictionnaires les fournissent toutes.
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

  /** Catégorie de pluriel pour ce nombre dans cette langue (one, other, many…). */
  plural(n: number): PluralCategory {
    this.#plural ??= new Intl.PluralRules(this.#tag);
    return this.#plural.select(n);
  }

  /** « 4 128 » / « 4,128 » / « 4.128 » selon la langue. */
  number(n: number): string {
    this.#number ??= new Intl.NumberFormat(this.#tag);
    return this.#number.format(n);
  }

  /** « il y a 3 h », « hier », « il y a 2 semaines ». Bascule en date au-delà d'un an. */
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

  /** Écart en unités entières, pour les formulations « depuis … » des dictionnaires. */
  elapsed(date: Date, now: Date = new Date()): { unit: "minute" | "hour" | "day" | "date"; n: number } {
    const diff = Math.max(0, now.getTime() - date.getTime());
    if (diff < HOUR) return { unit: "minute", n: Math.max(1, Math.floor(diff / MIN)) };
    if (diff < DAY) return { unit: "hour", n: Math.floor(diff / HOUR) };
    const days = Math.floor(diff / DAY);
    if (days < 30) return { unit: "day", n: days };
    return { unit: "date", n: days };
  }

  /**
   * Nom propre précédé de sa préposition de génitif quand celle-ci dépend de la
   * phonétique du mot suivant. Le français élide (« le support d'Acme », « le
   * support de Nordfil ») : aucune donnée CLDR ne couvre ce cas, il doit être
   * traité par langue. Les autres langues du produit placent une préposition
   * invariable, que leur dictionnaire porte lui-même ; elles reçoivent donc le
   * nom tel quel.
   */
  of(name: string): string {
    if (this.locale.code !== "fr") return name;
    return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? `d'${name}` : `de ${name}`;
  }

  /** « 14 août 2026 » / « 14 August 2026 » / « 14. August 2026 ». */
  dateLong(date: Date): string {
    return date.toLocaleDateString(this.#tag, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /** « 14 août » — sans l'année. */
  dateShort(date: Date): string {
    return date.toLocaleDateString(this.#tag, { day: "numeric", month: "long" });
  }

  /** « 09:12 » si le message est du jour, sinon « 14 août, 09:12 ». */
  messageTime(date: Date, now: Date = new Date()): string {
    const hm = date.toLocaleTimeString(this.#tag, { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) return hm;
    const d = date.toLocaleDateString(this.#tag, { day: "numeric", month: "short" });
    return `${d}, ${hm}`;
  }
}

/* ---------- Helpers indépendants de la langue ----------
 * Initiales, nom court, prénom : ils manipulent le nom saisi par la personne,
 * pas du texte traduisible. Ils étaient suffixés `Fr` par habitude ; ils ne
 * doivent surtout pas être traduits. */

/** « Julien Lambert » → JL. */
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

/** « Julien L. » — pilule utilisateur du chrome. */
export function shortName(name: string | null, email: string): string {
  const dn = displayName(name, email);
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return dn;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** Prénom seul — « Réponse de Marie ». */
export function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

/** Temps de lecture ≈ 200 mots/min, minimum 1. */
export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
