/**
 * AG-09 chart components — server-rendered, design system tokens.
 * V2 shapes: KPI tiles (radius 13, figure 25px in the display face), "created vs
 * solved" as grouped bars 150 px tall bucketed by day or week, CSAT meters h9,
 * per-channel bars h7, 7 × 12 heatmap on a `16px repeat(12,1fr)` grid, gap 3.
 *
 * Server-rendered but synchronous: the translation function is passed to them as a
 * prop by the calling page rather than resolved here with `await getT()`.
 */

import type { Translate } from "@/i18n/server";

/** 56×20 sparkline from the design: normalized min→max, polyline 1.6, no end point. */
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

/**
 * KPI tile (V2): radius 13, padding 15/17, label 12 ink-3, the figure in the
 * display face at 25px, then the delta. The sparkline sits on the delta line —
 * the mockup does not draw one, but it costs no vertical rhythm and it is the
 * only place the shape of the period shows.
 */
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
  const sparkColor = delta?.tone === "bad" ? "var(--dang)" : "var(--brand-2)";
  return (
    <div
      className="flex flex-col"
      style={{
        gap: 4,
        borderRadius: 13,
        padding: "15px 17px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        boxShadow: "0 1px 2px rgba(13,28,23,.03)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-title)",
          fontSize: 25,
          fontWeight: 600,
          letterSpacing: "-.01em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div className="flex items-center justify-between" style={{ gap: 8, marginTop: "auto" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: delta ? DELTA_INK[delta.tone] : "var(--ink-3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {delta?.text ?? ""}
        </span>
        <div style={{ width: 48, height: 18, flex: "none" }}>
          {spark && spark.some((v) => v !== spark[0]) ? (
            <Sparkline values={spark} color={sparkColor} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal meter used by the CSAT breakdown — label, track, raw count.
 * Same 9 px track as the mockup; the width is the share of the responses.
 */
export function MeterRow({
  label,
  value,
  total,
  color,
  t,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  t: Translate;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center" style={{ gap: 10, fontSize: 12.5 }}>
      <span style={{ width: 92, flex: "none", color: "var(--ink-2)" }}>{label}</span>
      <div
        style={{ flex: 1, height: 9, borderRadius: 5, background: "var(--sunk)", overflow: "hidden" }}
      >
        <div
          style={{ width: `${pct.toFixed(1)}%`, height: "100%", background: color, borderRadius: 5 }}
        />
      </div>
      <span
        className="tabular-nums"
        style={{ width: 40, textAlign: "right", color: "var(--ink-3)" }}
      >
        {t.fmt.number(value)}
      </span>
    </div>
  );
}

/** "■ Created ■ Solved" legend — V2: 10×10 squares radius 3, 12px ink-2. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex" style={{ gap: 16, fontSize: 12, color: "var(--ink-2)" }}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center" style={{ gap: 6 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 3, background: i.color, flex: "none" }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export type Bucket = { day: string; created: number; resolved: number };

/**
 * Buckets the daily series so the bar chart never draws more columns than it can
 * label: a day each over a week, a week each beyond that. 90 days would be 13
 * weekly bars, which the card still fits because the bars flex.
 */
export function bucketDaily(daily: Bucket[], perBucket: number): Bucket[] {
  if (perBucket <= 1) return daily;
  const out: Bucket[] = [];
  // Filled from the end, so the last bucket is the current, complete-so-far one
  // and it is the OLDEST bucket that is short — a partial week drawn as the last
  // column reads as a collapse in volume that never happened.
  for (let end = daily.length; end > 0; end -= perBucket) {
    const slice = daily.slice(Math.max(0, end - perBucket), end);
    out.unshift({
      day: slice[0]!.day,
      created: slice.reduce((acc, d) => acc + d.created, 0),
      resolved: slice.reduce((acc, d) => acc + d.resolved, 0),
    });
  }
  return out;
}

/**
 * "Tickets created vs solved" — V2 grouped bars: 150 px tall, one pair per
 * bucket, 22 px wide at most, --series-mute for created and solid --brand for
 * solved. The parent card sets the width.
 */
export function BucketBars({
  data,
  labelA,
  labelB,
  t,
}: {
  data: Bucket[];
  labelA: string;
  labelB: string;
  t: Translate;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.created, d.resolved)), 1);
  // A bucket holding one ticket against a peak of 300 rounds to 0 % and vanishes;
  // 3 % is the smallest bar that still reads as a bar.
  const height = (v: number) => (v === 0 ? "0%" : `${Math.max(3, (v / max) * 100).toFixed(1)}%`);

  return (
    <div
      className="flex items-end"
      style={{ gap: 14, height: 150, paddingTop: 8 }}
      role="img"
      aria-label={t("app.reports.chartDailyAria", { labelA, labelB })}
    >
      {data.map((d) => (
        <div
          key={d.day}
          className="flex flex-col items-center justify-end"
          style={{ flex: 1, minWidth: 0, gap: 6, height: "100%" }}
          title={t("app.reports.chartDailyPoint", {
            date: t.fmt.dateCompact(new Date(d.day)),
            labelA,
            created: d.created,
            labelB,
            resolved: d.resolved,
          })}
        >
          <div
            className="flex w-full items-end justify-center"
            style={{ gap: 4, flex: 1, minHeight: 0 }}
          >
            <div
              style={{
                flex: 1,
                maxWidth: 22,
                height: height(d.created),
                background: "var(--series-mute)",
                borderRadius: "5px 5px 0 0",
              }}
            />
            <div
              style={{
                flex: 1,
                maxWidth: 22,
                height: height(d.resolved),
                background: "var(--brand)",
                borderRadius: "5px 5px 0 0",
              }}
            />
          </div>
          <span
            className="truncate"
            style={{ fontSize: 11, color: "var(--ink-3)", maxWidth: "100%" }}
          >
            {t.fmt.dateCompact(new Date(d.day))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Breakdown by channel" — h7 bars, width = share of the total, raw value on the right. */
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

/** Day initials, Monday to Sunday — one key per day, the language decides. */
const DAY_KEYS = [
  "app.reports.dayMon",
  "app.reports.dayTue",
  "app.reports.dayWed",
  "app.reports.dayThu",
  "app.reports.dayFri",
  "app.reports.daySat",
  "app.reports.daySun",
] as const;

/** "Volume by hour and day" — 7 rows × 12 hours, `16px repeat(12,1fr)` grid, gap 3. */
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
