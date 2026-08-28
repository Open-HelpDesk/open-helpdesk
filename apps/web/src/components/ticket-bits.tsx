import {
  PRIORITY_COLORS,
  PRIORITY_KEYS,
  STATUS_KEYS,
  STATUS_TOKEN,
  duration,
  initialsOf,
} from "@/lib/format";
import type { Translate } from "@/i18n/server";
import type { MessageParams } from "@/i18n/dictionary";
import type { MessageKey } from "@/i18n/dictionaries/en";

/**
 * Translating is all these pills need. The type is deliberately narrower than
 * `Translate`: they are rendered both from a server component and from the
 * client inbox table, whose `t` does not carry the dictionary.
 */
type Tr = (key: MessageKey, params?: MessageParams) => string;

/** Status pill — agent space design: padding 2px 8px, radius 20, 11.5px/600. */
export function StatusChip({ status, t }: { status: string; t: Tr }) {
  const key = STATUS_TOKEN[status] ?? "closed";
  const labelKey = STATUS_KEYS[status];
  return (
    <span
      className="inline-block whitespace-nowrap"
      style={{
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11.5,
        fontWeight: 600,
        background: `var(--${key}-t)`,
        color: `var(--${key})`,
      }}
    >
      {labelKey ? t(labelKey) : status}
    </span>
  );
}

/** Priority — colored 7×7 dot + optional label, never a solid background. */
export function PriorityDot({
  priority,
  t,
  withLabel = false,
  size = 7,
}: {
  priority: string;
  t: Tr;
  withLabel?: boolean;
  size?: number;
}) {
  const color = PRIORITY_COLORS[priority] ?? "var(--ink-3)";
  const labelKey = PRIORITY_KEYS[priority];
  const label = labelKey ? t(labelKey) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className="inline-block rounded-full"
        style={{ width: size, height: size, background: color }}
      />
      {withLabel && <span style={{ fontSize: 12.5 }}>{label}</span>}
    </span>
  );
}

/**
 * SLA badge — neutral (> 30 min) → amber (< 30 min) → red (overdue, persistent
 * until a reply). The due date shown: 1st reply while it is due, otherwise resolution.
 * Design: 11×11 clock + value, padding 2px 7px, radius 5, 11.5px/600, bordered.
 */
export function SlaBadge({
  firstRepliedAt,
  firstReplyDueAt,
  resolveDueAt,
  t,
}: {
  firstRepliedAt: Date | null;
  firstReplyDueAt: Date | null;
  resolveDueAt: Date | null;
  t: Translate;
}) {
  const due = !firstRepliedAt && firstReplyDueAt ? firstReplyDueAt : resolveDueAt;
  if (!due) return null;
  const remaining = due.getTime() - Date.now();
  const overdue = remaining <= 0;
  const soon = !overdue && remaining < 30 * 60_000;
  const bg = overdue ? "var(--dang-t)" : soon ? "var(--wait-t)" : "transparent";
  const fg = overdue ? "var(--dang)" : soon ? "var(--wait)" : "var(--ink-3)";
  const line = overdue ? "var(--dang)" : soon ? "var(--wait)" : "var(--line)";
  return (
    <span
      className="inline-flex items-center whitespace-nowrap tabular-nums"
      style={{
        gap: 4,
        padding: "2px 7px",
        borderRadius: 5,
        fontSize: 11.5,
        fontWeight: 600,
        background: bg,
        color: fg,
        border: `1px solid ${line}`,
      }}
    >
      <SlaClock />
      {overdue ? t("app.shell.slaOverdue") : duration(t, remaining)}
    </span>
  );
}

/** 11×11 clock of the SLA badges (AG-03 design). */
export function SlaClock() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Tone rotation of the design's avatars (open, new, acc, wait, pause). */
/** The seven tones the mockup gives its avatars, in its order. */
const AVATAR_TONES = [
  ["var(--open-t)", "var(--open)"],
  ["var(--wait-t)", "var(--wait)"],
  ["var(--brand-t)", "var(--brand)"],
  ["var(--viol-t)", "var(--viol)"],
  ["var(--ok-t)", "var(--ok)"],
  ["var(--dang-t)", "var(--dang)"],
  ["var(--pause-t)", "var(--pause)"],
] as const;

/**
 * Tone of a person, derived from their name.
 *
 * The mockup gives each contact their own colour — Julien blue, Sofia orange,
 * Marc green — and keeps it. Deriving from the name is what makes it *theirs*:
 * a tone taken from the row index repaints someone the moment the list is
 * sorted differently, which is the opposite of a recognisable face.
 */
function toneOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_TONES.length;
}

/** Initials avatar — `tone` applies the design's tone rotation (row index). */
export function Avatar({
  name,
  size = 24,
  tone,
  fontSize,
  bordered = false,
}: {
  name: string;
  size?: number;
  tone?: number;
  fontSize?: number;
  bordered?: boolean;
}) {
  const toneIndex =
    tone === undefined
      ? toneOf(name)
      : ((tone % AVATAR_TONES.length) + AVATAR_TONES.length) % AVATAR_TONES.length;
  const [bg, ink] = AVATAR_TONES[toneIndex] ?? AVATAR_TONES[2];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? (size <= 22 ? 9 : size <= 32 ? 11 : 15),
        background: bg,
        color: ink,
        border: bordered ? "1px solid var(--acc-b)" : undefined,
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}
