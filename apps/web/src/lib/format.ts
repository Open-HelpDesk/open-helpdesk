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

/** « -12 min » si dépassé, « 24 min » sinon — format court des badges SLA (AG-03). */
export function slaShortFr(remainingMs: number): string {
  return remainingMs < 0 ? `-${durationFr(-remainingMs)}` : durationFr(remainingMs);
}

/** « 148 Ko », « 1,2 Mo ». */
export function sizeFr(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Nombre en format français (« 4 128 »). */
export function nFr(x: number): string {
  return x.toLocaleString("fr-FR");
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

/** Statut → clé de token CSS (--new, --open, --wait, --pause, --ok, --closed). */
export const STATUS_TOKEN: Record<string, string> = {
  new: "new",
  open: "open",
  waiting: "wait",
  on_hold: "pause",
  resolved: "ok",
  closed: "closed",
};

export const PRIORITY_LABELS_FR: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

/** Couleurs de priorité — design espace agent (fixes, jamais de fond plein). */
export const PRIORITY_COLORS: Record<string, string> = {
  low: "#8A9993",
  normal: "#1D4ED8",
  high: "#E2711D",
  urgent: "#C0342B",
};

export const CHANNEL_LABELS_FR: Record<string, string> = {
  email: "Email",
  portal: "Portail",
  widget: "Widget",
  api: "API",
};
