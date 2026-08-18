/**
 * Formats partagés par les écrans de l'espace agent.
 *
 * Les libellés (statut, priorité, canal) et les unités ne sont plus des
 * constantes françaises mais des CLÉS : le rendu passe par `t()`, qui connaît la
 * langue du tenant. Les fonctions qui composent une durée reçoivent donc `t`.
 * Les couleurs et les tokens CSS, eux, ne dépendent pas de la langue et restent
 * de simples tables.
 */
import type { MessageKey } from "@/i18n/dictionaries/fr";

/** Ce dont ces fonctions ont besoin : traduire et mettre en forme un nombre. */
type Tr = {
  (key: MessageKey, params?: Record<string, string | number>): string;
  fmt: { number: (n: number) => string };
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** « 2 h 30 », « 45 min » — durée restante positive, dans la langue du tenant. */
export function duration(t: Tr, ms: number): string {
  if (ms < HOUR) return t("app.unit.minutes", { count: Math.max(1, Math.floor(ms / MIN)) });
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  return m > 0
    ? t("app.unit.hoursMinutes", { hours: h, minutes: String(m).padStart(2, "0") })
    : t("app.unit.hours", { count: h });
}

/** « -12 min » si dépassé, « 24 min » sinon — format court des badges SLA (AG-03). */
export function slaShort(t: Tr, remainingMs: number): string {
  return remainingMs < 0 ? `-${duration(t, -remainingMs)}` : duration(t, remainingMs);
}

/** « 148 Ko », « 1,2 Mo » — le séparateur décimal vient de la langue. */
export function size(t: Tr, bytes: number): string {
  if (bytes < 1024 * 1024)
    return t("app.unit.kilobytes", { count: Math.max(1, Math.round(bytes / 1024)) });
  return t("app.unit.megabytes", { value: t.fmt.number(Math.round((bytes / (1024 * 1024)) * 10) / 10) });
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const STATUS_KEYS: Record<string, MessageKey> = {
  new: "app.status.new",
  open: "app.status.open",
  waiting: "app.status.waiting",
  on_hold: "app.status.onHold",
  resolved: "app.status.resolved",
  closed: "app.status.closed",
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

export const PRIORITY_KEYS: Record<string, MessageKey> = {
  low: "app.priority.low",
  normal: "app.priority.normal",
  high: "app.priority.high",
  urgent: "app.priority.urgent",
};

/** Couleurs de priorité — design espace agent (fixes, jamais de fond plein). */
export const PRIORITY_COLORS: Record<string, string> = {
  low: "#8A9993",
  normal: "#1D4ED8",
  high: "#E2711D",
  urgent: "#C0342B",
};

export const CHANNEL_KEYS: Record<string, MessageKey> = {
  email: "app.channel.email",
  portal: "app.channel.portal",
  widget: "app.channel.widget",
  api: "app.channel.api",
};
