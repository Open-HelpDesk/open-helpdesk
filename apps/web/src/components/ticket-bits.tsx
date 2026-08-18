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
import type { MessageKey } from "@/i18n/dictionaries/fr";

/**
 * Traduire suffit à ces pastilles. Le type est volontairement plus étroit que
 * `Translate` : elles sont rendues aussi bien depuis un composant serveur que
 * depuis la table cliente de l'inbox, dont le `t` n'embarque pas le dictionnaire.
 */
type Tr = (key: MessageKey, params?: MessageParams) => string;

/** Pilule statut — design espace agent : padding 2px 8px, radius 20, 11.5px/600. */
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

/** Priorité — pastille 7×7 colorée + libellé optionnel, jamais de fond plein (specs/02). */
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
 * Badge SLA — neutre (> 30 min) → ambre (< 30 min) → rouge (dépassé, persistant
 * jusqu'à réponse). L'échéance affichée : 1ʳᵉ réponse tant qu'elle est due, sinon résolution.
 * Design : horloge 11×11 + valeur, padding 2px 7px, radius 5, 11.5px/600, bordé.
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

/** Horloge 11×11 des badges SLA (design AG-03). */
export function SlaClock() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Rotation de teintes des avatars du design (open, new, acc, wait, pause). */
const AVATAR_TONES = [
  ["var(--open-t)", "var(--open)"],
  ["var(--new-t)", "var(--new)"],
  ["var(--acc-t)", "var(--acc)"],
  ["var(--wait-t)", "var(--wait)"],
  ["var(--pause-t)", "var(--pause)"],
] as const;

/** Avatar initiales — `tone` applique la rotation de teintes du design (index de ligne). */
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
      ? 2 // teinte accent par défaut
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
