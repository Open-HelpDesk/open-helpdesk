/**
 * The logo tile of a catalogue application (spec 19, D-SD7).
 *
 * CONTRACT — owned by the logos agent, imported by every desk screen:
 *  - `iconKey` → a bundled brand icon (simple-icons, CC0), rendered inline;
 *  - `logoUrl` → an uploaded logo served by our own storage;
 *  - otherwise the initials on the app colour.
 * Never a remote favicon: the design fetched google.com/s2/favicons, which sends
 * every employee's IP address to Google on each catalogue view.
 *
 * No hooks, no client code: usable from server and client components alike.
 */
import type { CSSProperties } from "react";
import { getBrandIcon } from "./brand-icons";

export type AppIconProps = {
  name: string;
  iconKey?: string | null;
  logoUrl?: string | null;
  color?: string | null;
  /** Tile size in px. Default 36. */
  size?: number;
};

const FALLBACK_COLOR = "#51625B";

/** Only same-origin paths and inline data: a logo URL can never reach a third party. */
function isOwnUrl(url: string): boolean {
  return (url.startsWith("/") && !url.startsWith("//")) || url.startsWith("data:image/") || url.startsWith("blob:");
}

/** `#RRGGBB` mixed with white — the opaque tint behind initials. */
function tint(hex: string, amount = 0.14): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#EEF2F0";
  const n = Number.parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function AppIcon({ name, iconKey, logoUrl, color, size = 36 }: AppIconProps) {
  const tile: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    boxSizing: "border-box",
    border: "1px solid var(--line)",
    overflow: "hidden",
  };
  const glyph = Math.round(size * 0.62);

  if (logoUrl && isOwnUrl(logoUrl)) {
    return (
      <span style={{ ...tile, background: "#fff" }}>
        <img src={logoUrl} alt={name} width={glyph} height={glyph} style={{ objectFit: "contain", display: "block" }} />
      </span>
    );
  }

  const brand = getBrandIcon(iconKey);
  if (brand?.path) {
    const stroked = brand.strokeWidth != null;
    return (
      <span role="img" aria-label={name} title={name} style={{ ...tile, background: "#fff" }}>
        <svg
          viewBox={brand.viewBox ?? "0 0 24 24"}
          width={glyph}
          height={glyph}
          aria-hidden="true"
          focusable="false"
          style={{ display: "block" }}
        >
          {stroked ? (
            <path d={brand.path} fill="none" stroke={brand.hex} strokeWidth={brand.strokeWidth} strokeLinecap="round" />
          ) : (
            <path d={brand.path} fill={brand.hex} />
          )}
        </svg>
      </span>
    );
  }

  // No glyph: initials on the app colour (or the brand colour we know).
  const ink = color ?? brand?.hex ?? FALLBACK_COLOR;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      style={{
        ...tile,
        background: tint(ink),
        color: ink,
        fontSize: Math.max(9, Math.round(size * 0.32)),
        fontWeight: 700,
        letterSpacing: "0.01em",
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
