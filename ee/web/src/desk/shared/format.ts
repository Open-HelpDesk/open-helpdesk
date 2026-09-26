/**
 * Money, days and provisioning labels for the ee/ desk screens — pure
 * functions, usable on both sides of the client boundary.
 *
 * Amounts are stored in cents. The currency sign lives in the dictionaries
 * (its side of the number changes with the language); the number itself always
 * goes through the locale formatter.
 */
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { MessageParams } from "@/i18n/dictionary";

export type Tr = {
  (key: MessageKey, params?: MessageParams): string;
  fmt: {
    number: (n: number) => string;
    decimal: (n: number, digits?: number) => string;
    amount: (n: number) => string;
    dateShort: (d: Date) => string;
    dateLong: (d: Date) => string;
    relative: (d: Date, now?: Date) => string;
  };
};

const DAY = 24 * 3600 * 1000;

/** "4 320 €" — whole euros, for tables and totals. */
export function euros(t: Tr, cents: number): string {
  return t("desk.ee.money.euros", { amount: t.fmt.number(Math.round(cents / 100)) });
}

/** "7,20 €" — exact, for a monthly seat price. */
export function eurosExact(t: Tr, cents: number): string {
  const whole = cents % 100 === 0;
  return t("desk.ee.money.euros", {
    amount: whole ? t.fmt.number(cents / 100) : t.fmt.amount(cents / 100),
  });
}

/** "48,2 k€" — the KPI tiles, where a full figure would not fit. */
export function kEuros(t: Tr, cents: number): string {
  const e = cents / 100;
  if (Math.abs(e) < 1000) return euros(t, cents);
  return t("desk.ee.money.thousands", { amount: t.fmt.decimal(e / 1000, 1) });
}

/** A `date` column ("2026-10-15") read as a local calendar day. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from today to a calendar day — negative when past. */
export function daysUntil(day: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((parseDay(day).getTime() - today) / DAY);
}

/** Whole days since a timestamp. */
export function daysSince(at: Date | string, now: Date = new Date()): number {
  const d = typeof at === "string" ? new Date(at) : at;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));
}

/** "2026-10-15" for today + n days. */
export function isoDay(offsetDays = 0, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type ProvisioningKind = "entra" | "google" | "scim" | "manual";

/**
 * How an application's accounts are really created today (doctrine rule 5):
 * automatic only when a connector is connected — a connector in error puts
 * the application back to manual, and the screen says so.
 */
export function provisioningOf(app: {
  connectorKind: string | null;
  connectorStatus: string | null;
  scimBaseUrl: string | null;
  hasScimToken: boolean;
}): { kind: ProvisioningKind; automatic: boolean; degraded: boolean } {
  if (app.connectorKind && app.connectorKind !== "manual") {
    const ok = app.connectorStatus === "connected";
    return { kind: app.connectorKind as ProvisioningKind, automatic: ok, degraded: !ok };
  }
  if (app.scimBaseUrl && app.hasScimToken) return { kind: "scim", automatic: true, degraded: false };
  return { kind: "manual", automatic: false, degraded: false };
}

/** "Entra ID", "Google Workspace", "SCIM" — product names, never translated. */
export const CONNECTOR_NAMES: Record<Exclude<ProvisioningKind, "manual">, string> = {
  entra: "Entra ID",
  google: "Google Workspace",
  scim: "SCIM",
};

/** Initials of a person, and a stable tone picked from their name. */
const TONES = ["open", "ok", "viol", "wait", "pause"] as const;
export function avatarOf(name: string): { ini: string; bg: string; fg: string } {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tone = TONES[h % TONES.length]!;
  return { ini: ini || "?", bg: `var(--${tone}-t)`, fg: `var(--${tone})` };
}

/** CSV cell, `;`-separated like the audit export. */
export function csvCell(v: unknown): string {
  return `"${String(v ?? "").replaceAll('"', '""')}"`;
}
