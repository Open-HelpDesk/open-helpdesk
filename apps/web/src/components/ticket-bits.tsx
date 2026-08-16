import { PRIORITY_LABELS_FR, STATUS_LABELS_FR, durationFr, initialsOf } from "@/lib/format";

/** Chip statut — fond teinté 10 %, texte foncé de la même teinte (specs/02). */
export function StatusChip({ status }: { status: string }) {
  const key = { new: "new", open: "open", waiting: "wait", on_hold: "pause", resolved: "ok", closed: "closed" }[
    status
  ];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `var(--${key}-t)`, color: `var(--${key})` }}
    >
      {STATUS_LABELS_FR[status] ?? status}
    </span>
  );
}

/** Priorité — point coloré + libellé, jamais de fond plein (specs/02). */
export function PriorityDot({ priority, withLabel = false }: { priority: string; withLabel?: boolean }) {
  const color = { low: "var(--closed)", normal: "var(--open)", high: "var(--wait)", urgent: "var(--dang)" }[
    priority
  ];
  return (
    <span className="inline-flex items-center gap-1.5" title={PRIORITY_LABELS_FR[priority]}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {withLabel && <span className="text-xs">{PRIORITY_LABELS_FR[priority]}</span>}
    </span>
  );
}

/**
 * Badge SLA — neutre (> 30 min) → ambre (< 30 min) → rouge (dépassé, persistant
 * jusqu'à réponse). L'échéance affichée : 1ʳᵉ réponse tant qu'elle est due, sinon résolution.
 */
export function SlaBadge({
  firstRepliedAt,
  firstReplyDueAt,
  resolveDueAt,
}: {
  firstRepliedAt: Date | null;
  firstReplyDueAt: Date | null;
  resolveDueAt: Date | null;
}) {
  const due = !firstRepliedAt && firstReplyDueAt ? firstReplyDueAt : resolveDueAt;
  if (!due) return null;
  const remaining = due.getTime() - Date.now();
  const overdue = remaining <= 0;
  const soon = !overdue && remaining < 30 * 60_000;
  const bg = overdue ? "var(--dang-t)" : soon ? "var(--wait-t)" : "var(--sunk)";
  const fg = overdue ? "var(--dang)" : soon ? "var(--wait)" : "var(--mute)";
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      ⏱ {overdue ? "SLA dépassé" : durationFr(remaining)}
    </span>
  );
}

/** Avatar initiales. */
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: "var(--acc-t)",
        color: "var(--acc)",
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}
