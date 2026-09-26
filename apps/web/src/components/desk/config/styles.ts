import type { CSSProperties } from "react";

/**
 * Style constants of SD-A9, in a plain module: a value exported from a
 * "use client" file reaches a server component as a client reference, not as
 * the object — spreading it there would silently yield nothing.
 */
export const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

export const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };

export const inputCss: CSSProperties = {
  height: 34,
  padding: "0 11px",
  border: "1px solid var(--line)",
  borderRadius: 9,
  fontSize: 12.5,
  outline: "none",
  background: "var(--panel)",
  color: "var(--ink)",
  minWidth: 0,
};

export const linkButton: CSSProperties = {
  height: 34,
  padding: "0 13px",
  borderRadius: 9,
  border: "1px solid var(--line)",
  background: "var(--panel)",
  display: "inline-flex",
  alignItems: "center",
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
  color: "var(--ink)",
};
