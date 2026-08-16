/** Formats français partagés par les écrans. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j », sinon date courte. */
export function relativeFr(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (diff < MIN) return "à l'instant";
  if (diff < HOUR) return `il y a ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `il y a ${Math.floor(diff / HOUR)} h`;
  if (diff < 7 * DAY) return `il y a ${Math.floor(diff / DAY)} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** « 2 h 30 », « 45 min » — durée restante positive. */
export function durationFr(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / MIN))} min`;
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const STATUS_LABELS_FR: Record<string, string> = {
  new: "Nouveau",
  open: "Ouvert",
  waiting: "En attente",
  on_hold: "En pause",
  resolved: "Résolu",
  closed: "Clos",
};

export const PRIORITY_LABELS_FR: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};
