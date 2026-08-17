/**
 * Formats français du portail client (PT) — distincts de src/lib/format.ts (app agent) :
 * le portail parle au client (« hier », « depuis 3 jours », « 4 128 vues »…).
 */

import { parseArticle, parseInline } from "@/lib/article-format";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** « à l'instant », « il y a 3 h », « hier », « il y a 4 jours », « il y a 2 semaines », « il y a 1 mois ». */
export function relativeLongFr(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < MIN) return "à l'instant";
  if (diff < HOUR) return `il y a ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `il y a ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `il y a ${w} semaine${w > 1 ? "s" : ""}`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** « depuis 20 min », « depuis 3 h », « depuis hier », « depuis 5 jours » (PT-05). */
export function sinceFr(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  if (diff < HOUR) return `depuis ${Math.max(1, Math.floor(diff / MIN))} min`;
  if (diff < DAY) return `depuis ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "depuis hier";
  if (days < 30) return `depuis ${days} jours`;
  return `depuis le ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}

/** « 14 août 2026 ». */
export function dateLongFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** « 09:12 » si aujourd'hui, sinon « 14 août, 09:12 » (fil PT-06). */
export function messageTimeFr(date: Date, now: Date = new Date()): string {
  const hm = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === now.toDateString()
    ? hm
    : `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}, ${hm}`;
}

/** « 4 128 » — séparateur de milliers français. */
export function numberFr(n: number): string {
  return n.toLocaleString("fr-FR");
}

/** « 8 articles », « 1 article », « 0 article ». */
export function pluralFr(n: number, singular: string, plural = `${singular}s`): string {
  return `${numberFr(n)} ${n > 1 ? plural : singular}`;
}

/** Initiales d'un nom ou d'un email — « Julien Lambert » → JL. */
export function initialsFr(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  return letters || "?";
}

export function displayNameFr(name: string | null, email: string): string {
  return name?.trim() || email.split("@")[0]!;
}

/** « Julien L. » — pilule utilisateur du chrome. */
export function shortNameFr(name: string | null, email: string): string {
  const dn = displayNameFr(name, email);
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return dn;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** Prénom seul — « Réponse de Marie » (PT-05). */
export function firstNameFr(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

/** Élision française : « le support d'Acme » / « le support de Nordfil ». */
export function deFr(name: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** Temps de lecture ≈ 200 mots/min, minimum 1 (méta PT-03). */
export function readingMinutesFr(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Extrait d'un corps d'article : le premier paragraphe réel, sans balisage.
 * S'appuie sur l'analyseur partagé pour ne pas réinterpréter le format en double
 * (une liste ou un sous-titre ne doit pas ressortir avec ses tirets).
 */
export function excerptFr(body: string | null, max = 180): string {
  if (!body) return "";
  const bloc = parseArticle(body).find((b) => b.type === "p");
  if (!bloc || bloc.type !== "p") return "";
  const text = parseInline(bloc.text)
    .map((t) => t.text)
    .join("");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
