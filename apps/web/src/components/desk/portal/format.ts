/**
 * Formatting shared by the employee portal screens — server and client alike.
 * Every number and date goes through the i18n `fmt` helpers; every word
 * through the `desk.portal.` fragment.
 */
import type { MessageKey } from "@/i18n/dictionaries/en";
import type { MessageParams } from "@/i18n/dictionary";
import type { LocaleFormat } from "@/i18n/format";
import type { ConnectorKindName, RequestState, StepName } from "@/lib/desk/portal-data";

export type PortalT = ((key: MessageKey, params?: MessageParams) => string) & { fmt: LocaleFormat };

/** "15 €", "7,25 €" — whole amounts without decimals, as the design writes them. */
export function money(t: PortalT, cents: number): string {
  const v = cents / 100;
  const amount = Number.isInteger(v) ? t.fmt.number(v) : t.fmt.amount(v);
  return t("desk.portal.money", { amount });
}

/** "15 € / month", or "Free". */
export function monthly(t: PortalT, cents: number): string {
  return cents === 0 ? t("desk.portal.free") : t("desk.portal.perMonth", { price: money(t, cents) });
}

/** A `date` column ("2026-10-14") read as a local calendar day, not UTC midnight. */
export function day(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** "March 2024" — the design's "depuis mars 2024". */
export function monthYear(t: PortalT, date: Date): string {
  return date.toLocaleDateString(t.fmt.locale.tag, { month: "long", year: "numeric" });
}

export function durationLabel(t: PortalT, days: number | null): string {
  return days == null ? t("desk.portal.duration.permanent") : t("desk.portal.duration.days", { count: days });
}

/** Brand names are not translated; "manual" is a sentence of its own. */
export const CONNECTOR_BRAND: Record<Exclude<ConnectorKindName, "manual">, string> = {
  entra: "Entra ID",
  google: "Google Workspace",
  scim: "SCIM",
};

export function stepLabel(t: PortalT, step: StepName, merged: StepName[] = []): string {
  if (merged.includes("manager") && merged.includes("owner")) return t("desk.portal.step.managerOwner");
  switch (step) {
    case "manager":
      return t("desk.portal.step.manager");
    case "owner":
      return t("desk.portal.step.owner");
    case "privileged":
      return t("desk.portal.step.privileged");
    case "finance":
      return t("desk.portal.step.finance");
  }
}

type Tone = { c: string; bg: string };
const TONES: Record<RequestState, Tone> = {
  awaiting_manager: { c: "var(--wait)", bg: "var(--wait-t)" },
  awaiting_owner: { c: "var(--viol)", bg: "var(--viol-t)" },
  awaiting_extra: { c: "var(--viol)", bg: "var(--viol-t)" },
  provisioning: { c: "var(--open)", bg: "var(--open-t)" },
  provisioning_failed: { c: "var(--open)", bg: "var(--open-t)" },
  active: { c: "var(--ok)", bg: "var(--ok-t)" },
  refused: { c: "var(--dang)", bg: "var(--dang-t)" },
  cancelled: { c: "var(--ink-3)", bg: "var(--sunk)" },
};

export function stateTone(state: RequestState): Tone {
  return TONES[state];
}

export function stateLabel(t: PortalT, state: RequestState): string {
  switch (state) {
    case "awaiting_manager":
      return t("desk.portal.state.awaitingManager");
    case "awaiting_owner":
      return t("desk.portal.state.awaitingOwner");
    case "awaiting_extra":
      return t("desk.portal.state.awaitingExtra");
    case "provisioning":
      return t("desk.portal.state.provisioning");
    case "provisioning_failed":
      return t("desk.portal.state.provisioningManual");
    case "active":
      return t("desk.portal.state.active");
    case "refused":
      return t("desk.portal.state.refused");
    case "cancelled":
      return t("desk.portal.state.cancelled");
  }
}

/** Initials for an avatar — the name as typed, never translated. */
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** A stable pastel for a person's avatar, from the design's palette. */
const AVATARS: Tone[] = [
  { c: "var(--open)", bg: "var(--open-t)" },
  { c: "var(--wait)", bg: "var(--wait-t)" },
  { c: "var(--brand)", bg: "var(--brand-t)" },
  { c: "var(--viol)", bg: "var(--viol-t)" },
  { c: "var(--ok)", bg: "var(--ok-t)" },
  { c: "var(--dang)", bg: "var(--dang-t)" },
];
export function avatarTone(seed: string): Tone {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length]!;
}
