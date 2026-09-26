/**
 * Plain values shared by the service desk screens — tones, styles, date
 * helpers. No "use client" here: server components import these directly (a
 * value exported from a client module reaches the server as a reference, not
 * as the value).
 */
import type { CSSProperties } from "react";
import type { HardwareStatus, RequestState } from "@/lib/desk/it-data";

/* ---------- Tones ---------- */

export const STATE_TONE: Record<RequestState, { c: string; t: string }> = {
  awaiting_manager: { c: "var(--wait)", t: "var(--wait-t)" },
  awaiting_owner: { c: "var(--viol)", t: "var(--viol-t)" },
  awaiting_extra: { c: "var(--viol)", t: "var(--viol-t)" },
  provisioning: { c: "var(--open)", t: "var(--open-t)" },
  provisioning_failed: { c: "var(--dang)", t: "var(--dang-t)" },
  active: { c: "var(--ok)", t: "var(--ok-t)" },
  refused: { c: "var(--dang)", t: "var(--dang-t)" },
  cancelled: { c: "var(--ink-3)", t: "var(--sunk)" },
};

export const HW_TONE: Record<HardwareStatus, { c: string; t: string }> = {
  assigned: { c: "var(--ok)", t: "var(--ok-t)" },
  in_stock: { c: "var(--open)", t: "var(--open-t)" },
  in_repair: { c: "var(--wait)", t: "var(--wait-t)" },
  to_recover: { c: "var(--dang)", t: "var(--dang-t)" },
  retired: { c: "var(--ink-3)", t: "var(--sunk)" },
};

/* ---------- Buttons and fields ---------- */

export function btnStyle(kind: "primary" | "ghost" | "danger" | "muted" = "ghost"): CSSProperties {
  return {
    height: 36,
    padding: "0 15px",
    borderRadius: 9,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    background: kind === "primary" ? "var(--brand)" : "var(--panel)",
    color: kind === "primary" ? "var(--on-brand)" : kind === "danger" ? "var(--dang)" : kind === "muted" ? "var(--ink-3)" : "var(--ink)",
    border: `1px solid ${kind === "primary" ? "var(--brand)" : "var(--line)"}`,
  };
}

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 11px",
  borderRadius: 9,
  border: "1px solid var(--line)",
  background: "var(--panel)",
  fontSize: 13,
  color: "var(--ink)",
};

export const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" };

export const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

export const card: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 14,
};

/** A date-only column ("2027-03-01") as a Date at noon, so no timezone shifts the day. */
export function dateOnly(d: string): Date {
  return new Date(`${d.slice(0, 10)}T12:00:00`);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

