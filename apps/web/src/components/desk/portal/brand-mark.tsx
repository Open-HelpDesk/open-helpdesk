/** The product mark (three strokes), drawn inline — the design's header logo. */
export function BrandMark({ size = 22, color = "var(--brand)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <g stroke={color} strokeWidth="8" strokeLinecap="round">
        <path d="M24 8v32" />
        <path d="M10.1 16l27.8 16" />
        <path d="M37.9 16L10.1 32" />
      </g>
    </svg>
  );
}
