/**
 * Composants graphiques de AG-09 — rendus serveur, tokens du design system.
 * Fidèles à la maquette « Espace agent » : tuiles KPI (label 11.5 min-h 30, valeur 24px/600,
 * ligne delta + sparkline 56×20), « Créés vs résolus » en aires + lignes 640×190 (pad 22),
 * barres par canal h7, heatmap 7 × 12 en grille `16px repeat(12,1fr)` gap 3.
 *
 * Rendus serveur mais synchrones : la fonction de traduction leur est passée en
 * prop par la page appelante plutôt que résolue ici avec `await getT()`.
 */

import type { Translate } from "@/i18n/server";

/** Sparkline 56×20 du design : normalisée min→max, polyline 1.6, sans point terminal. */
export function Sparkline({
  values,
  color = "var(--acc-2)",
  width = 56,
  height = 20,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((p, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((p - min) / span) * (height - 3) - 1.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type KpiDelta = { text: string; tone: "good" | "bad" | "neutral" };

const DELTA_INK: Record<KpiDelta["tone"], string> = {
  good: "var(--ok)",
  bad: "var(--dang)",
  neutral: "var(--ink-2)",
};

/** Tuile KPI : label (min-h 30) · valeur 24px/600 · ligne « delta ↔ sparkline ». */
export function KpiTile({
  label,
  value,
  delta,
  spark,
}: {
  label: string;
  value: string;
  delta: KpiDelta | null;
  spark?: number[];
}) {
  const sparkColor = delta?.tone === "bad" ? "var(--dang)" : "var(--acc-2)";
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 7,
        borderRadius: 10,
        padding: 13,
        background: "var(--panel)",
        border: "1px solid var(--line)",
      }}
    >
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500, minHeight: 30 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      <div className="flex items-center justify-between" style={{ gap: 6 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: delta ? DELTA_INK[delta.tone] : "var(--ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {delta?.text ?? ""}
        </span>
        <div style={{ width: 56, height: 20 }}>
          {spark && spark.some((v) => v !== spark[0]) ? (
            <Sparkline values={spark} color={sparkColor} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Légende « ■ Créés ■ Résolus » — carrés 8×8, 11.5px ink-3, en ligne avec le titre. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex" style={{ gap: 11, fontSize: 11.5, color: "var(--ink-3)" }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center" style={{ gap: 5 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: 2, background: i.color, flex: "none" }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * « Créés vs résolus » — aires + lignes, viewBox 640×190, pad 22, 5 lignes de grille.
 * Le conteneur parent impose la hauteur (190px dans le design).
 */
export function AreaLines({
  data,
  labelA,
  labelB,
  t,
}: {
  data: { day: string; created: number; resolved: number }[];
  labelA: string;
  labelB: string;
  t: Translate;
}) {
  const W = 640;
  const H = 190;
  const PAD = 22;
  const peak = Math.max(...data.map((d) => Math.max(d.created, d.resolved)), 1);
  // Plafond « rond » pour que les 4 quarts de grille tombent sur des valeurs lisibles.
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(peak))) / 2);
  const max = Math.ceil(peak / (step * 4)) * step * 4;
  const x = (i: number) => PAD + (data.length > 1 ? (i / (data.length - 1)) * (W - PAD - 8) : 0);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD - 12);

  const path = (get: (d: (typeof data)[number]) => number) =>
    data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(" ");
  const fill = (get: (d: (typeof data)[number]) => number) =>
    `${path(get)} L${x(data.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const slot = data.length > 1 ? (W - PAD - 8) / (data.length - 1) : W;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      role="img"
      aria-label={t("app.reports.chartDailyAria", { labelA, labelB })}
      style={{ display: "block" }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={PAD}
          x2={W - 8}
          y1={y(max * f)}
          y2={y(max * f)}
          stroke="var(--line-2)"
          strokeWidth={1}
        />
      ))}
      {data.length > 1 && (
        <>
          <path d={fill((d) => d.created)} fill="var(--open)" opacity={0.12} />
          <path d={fill((d) => d.resolved)} fill="var(--acc-2)" opacity={0.14} />
          <path
            d={path((d) => d.created)}
            fill="none"
            stroke="var(--open)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d={path((d) => d.resolved)}
            fill="none"
            stroke="var(--acc-2)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </>
      )}
      {data.map((d, i) => (
        <rect key={d.day} x={x(i) - slot / 2} y={0} width={slot} height={H} fill="transparent">
          <title>
            {t("app.reports.chartDailyPoint", {
              date: t.fmt.dateShort(new Date(d.day)),
              labelA,
              created: d.created,
              labelB,
              resolved: d.resolved,
            })}
          </title>
        </rect>
      ))}
    </svg>
  );
}

/** « Répartition par canal » — barres h7, largeur = part du total, valeur brute à droite. */
export function ChannelBars({
  items,
  t,
}: {
  items: { label: string; value: number; color: string }[];
  t: Translate;
}) {
  const total = items.reduce((acc, i) => acc + i.value, 0);
  return (
    <div className="flex flex-col" style={{ gap: 11, paddingTop: 4 }}>
      {items.map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        return (
          <div
            key={item.label}
            className="flex flex-col"
            style={{ gap: 5 }}
            title={t("app.reports.channelTooltip", {
              label: item.label,
              value: item.value,
              percent: Math.round(pct),
            })}
          >
            <div className="flex justify-between" style={{ fontSize: 12.5 }}>
              <span>{item.label}</span>
              <span style={{ color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
                {t.fmt.number(item.value)}
              </span>
            </div>
            <div
              style={{ height: 7, borderRadius: 4, background: "var(--sunk)", overflow: "hidden" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct.toFixed(1)}%`,
                  background: item.color,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Initiales des jours, du lundi au dimanche — une clé par jour, la langue décide. */
const DAY_KEYS = [
  "app.reports.dayMon",
  "app.reports.dayTue",
  "app.reports.dayWed",
  "app.reports.dayThu",
  "app.reports.dayFri",
  "app.reports.daySat",
  "app.reports.daySun",
] as const;

/** « Volume par heure et jour » — 7 lignes × 12 heures, grille `16px repeat(12,1fr)` gap 3. */
export function Heatmap({
  grid,
  hours,
  t,
}: {
  grid: number[][];
  hours: number[];
  t: Translate;
}) {
  const max = Math.max(...grid.flat(), 1);
  const cols = "16px repeat(12,1fr)";
  const dayLabels = DAY_KEYS.map((k) => t(k));
  return (
    <div className="flex flex-col" style={{ gap: 3 }}>
      {grid.map((row, r) => (
        <div
          key={r}
          style={{ display: "grid", gridTemplateColumns: cols, gap: 3, alignItems: "center" }}
        >
          <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{dayLabels[r]}</div>
          {row.map((v, c) => (
            <div
              key={c}
              title={t("app.reports.heatmapCell", {
                day: dayLabels[r] ?? "",
                hour: hours[c] ?? 0,
                count: v,
              })}
              style={{
                height: 15,
                borderRadius: 3,
                background: v === 0 ? "var(--sunk)" : "var(--acc-2)",
                opacity: v === 0 ? 1 : 0.18 + (v / max) * 0.82,
              }}
            />
          ))}
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 3, marginTop: 3 }}>
        <div />
        {hours.map((h, i) => (
          <div
            key={h}
            style={{ fontSize: 9.5, color: "var(--ink-3)", textAlign: "center" }}
          >
            {i % 2 === 0 ? h : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
