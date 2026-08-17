/**
 * Composants graphiques de AG-09 — rendus serveur, tokens du design system.
 * Fidèles à la maquette espace-agent : tuiles KPI (valeur 24px/600, sparkline 56×20),
 * « Créés vs résolus » en aires + lignes 640×190, barres par canal h7, heatmap 7×12.
 */

export function Sparkline({
  values,
  width = 56,
  height = 20,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="var(--acc-2)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle cx={(values.length - 1) * step} cy={y(last)} r={2} fill="var(--acc-2)" />
    </svg>
  );
}

export type KpiDelta = { text: string; tone: "good" | "bad" | "neutral" };

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
  return (
    <div
      className="border"
      style={{
        borderRadius: 10,
        padding: 13,
        background: "var(--panel)",
        borderColor: "var(--line)",
      }}
    >
      <p style={{ fontSize: 11.5, color: "var(--ink-3)", minHeight: 30 }}>{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className="tabular-nums" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>
          {value}
        </span>
        {spark && spark.some((v) => v > 0) && <Sparkline values={spark} />}
      </div>
      {delta && (
        <p
          className="mt-1 tabular-nums"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color:
              delta.tone === "good"
                ? "var(--ok)"
                : delta.tone === "bad"
                  ? "var(--dang)"
                  : "var(--ink-3)",
          }}
        >
          {delta.text}
        </p>
      )}
    </div>
  );
}

/** « Créés vs résolus » — aires + lignes, viewBox 640×190, légende carrés 8×8. */
export function AreaLines({
  data,
  labelA,
  labelB,
}: {
  data: { day: string; created: number; resolved: number }[];
  labelA: string;
  labelB: string;
}) {
  const W = 640;
  const H = 190;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 22;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const max = Math.max(...data.map((d) => Math.max(d.created, d.resolved)), 1);
  const step = data.length > 1 ? W / (data.length - 1) : W;
  const x = (i: number) => i * step;
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  const line = (get: (d: (typeof data)[number]) => number) =>
    data.map((d, i) => `${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(" ");
  const area = (get: (d: (typeof data)[number]) => number) =>
    `${line(get)} ${x(data.length - 1).toFixed(1)},${(PAD_TOP + plotH).toFixed(1)} 0,${(
      PAD_TOP + plotH
    ).toFixed(1)}`;

  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div>
      <div className="mb-2 flex gap-4" style={{ fontSize: 12, color: "var(--ink-2)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, background: "var(--open)", borderRadius: 2 }} />
          {labelA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, background: "var(--acc-2)", borderRadius: 2 }} />
          {labelB}
        </span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${labelA} et ${labelB} par jour`}
        style={{ display: "block" }}
      >
        {/* Grille horizontale discrète */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={PAD_TOP + plotH - f * plotH}
            y2={PAD_TOP + plotH - f * plotH}
            stroke="var(--line-2)"
            strokeWidth={1}
          />
        ))}
        {data.length > 1 && (
          <>
            <polygon points={area((d) => d.created)} fill="var(--open)" opacity={0.12} />
            <polygon points={area((d) => d.resolved)} fill="var(--acc-2)" opacity={0.12} />
            <polyline
              points={line((d) => d.created)}
              fill="none"
              stroke="var(--open)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <polyline
              points={line((d) => d.resolved)}
              fill="none"
              stroke="var(--acc-2)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </>
        )}
        {data.map(
          (d, i) =>
            i % labelEvery === 0 && (
              <text
                key={d.day}
                x={Math.min(Math.max(x(i), 14), W - 20)}
                y={H - 6}
                textAnchor="middle"
                fontSize={9.5}
                fill="var(--ink-3)"
                fontFamily="var(--font-mono)"
              >
                {fmtDay(d.day)}
              </text>
            ),
        )}
        {/* Survol natif par jour */}
        {data.map((d, i) => (
          <rect
            key={`h-${d.day}`}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={H}
            fill="transparent"
          >
            <title>{`${fmtDay(d.day)} — ${labelA} : ${d.created} · ${labelB} : ${d.resolved}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

/** « Répartition par canal » — barres h7 + pourcentage. */
export function ChannelBars({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((acc, i) => acc + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <div key={item.label} title={`${item.label} : ${item.value} (${pct} %)`}>
            <div
              className="mb-1 flex items-baseline justify-between"
              style={{ fontSize: 12 }}
            >
              <span>{item.label}</span>
              <span className="tabular-nums" style={{ color: "var(--ink-3)" }}>
                {item.value.toLocaleString("fr-FR")} · {pct} %
              </span>
            </div>
            <div
              className="w-full overflow-hidden"
              style={{ height: 7, borderRadius: 4, background: "var(--sunk)" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max((item.value / max) * 100, 2)}%`,
                  borderRadius: 4,
                  background: item.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

/** « Volume par heure et jour » — heatmap 7 jours × 12 heures, cases h15. */
export function Heatmap({ grid, hours }: { grid: number[][]; hours: number[] }) {
  const max = Math.max(...grid.flat(), 1);
  const axisHours = hours.filter((_, i) => i % 2 === 0);
  return (
    <div>
      <div className="flex flex-col gap-0.5">
        {grid.map((row, r) => (
          <div key={r} className="flex items-center gap-0.5">
            <span
              className="w-4 shrink-0 text-center"
              style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
            >
              {DAY_LABELS[r]}
            </span>
            {row.map((v, c) => (
              <span
                key={c}
                className="min-w-0 flex-1"
                title={`${DAY_LABELS[r]} ${hours[c]} h : ${v} ticket${v > 1 ? "s" : ""}`}
                style={{
                  height: 15,
                  borderRadius: 3,
                  background: "var(--acc-2)",
                  opacity: v === 0 ? 0.06 : 0.15 + (v / max) * 0.85,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex" style={{ paddingLeft: 18 }}>
        {axisHours.map((h) => (
          <span
            key={h}
            className="flex-1 text-left"
            style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}
          >
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}
