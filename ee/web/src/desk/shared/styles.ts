/**
 * Style constants of the ee/ desk screens. A plain module, not a client one:
 * a server page importing a constant from a "use client" file receives a
 * client reference instead of the object, and every spread of it is empty.
 */
import type { CSSProperties } from "react";

/** 36 px outlined button of the design (secondary). */
export const BTN: CSSProperties = {
  height: 36,
  padding: "0 14px",
  borderRadius: 9,
  border: "1px solid var(--line)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
  color: "var(--ink)",
};

/** 38 px filled primary button. */
export const PRIMARY: CSSProperties = {
  ...BTN,
  height: 38,
  padding: "0 16px",
  fontSize: 13.5,
  background: "var(--brand)",
  borderColor: "var(--brand)",
  color: "#fff",
};

/** 30 px row action. */
export const SMALL_BTN: CSSProperties = {
  height: 30,
  padding: "0 11px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  display: "inline-flex",
  alignItems: "center",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
  background: "var(--panel)",
  color: "var(--ink-2)",
};

/** Card title strip: 11 px uppercase, tracked. */
export const GROUP_HEAD: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--line)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

export const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 14,
};
