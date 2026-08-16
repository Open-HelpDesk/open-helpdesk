/**
 * Composants graphiques de AG-09 — rendus serveur, tokens du design system.
 * Méthode dataviz : marques fines, écart 2 px entre barres adjacentes, extrémités
 * arrondies ancrées à la ligne de base, grille discrète, texte en tokens d'encre
 * (jamais la couleur de série), légende pour 2 séries, hover natif (<title>),
 * tabular-nums. Palette séries validée CVD (--chart-1 / --chart-2).
 */

export function Sparkline({ values, width = 64, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1]!;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" />
      {/* point terminal accentué */}
      <circle cx={(values.length - 1) * step} cy={y(last)} r={2.5} fill="var(--chart-1)" />
    </svg>
  );
}

export function KpiTile({
  label,
  value,
  deltaPct,
  goodWhen = "up",
  spark,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  goodWhen?: "up" | "down";
  spark?: number[];
}) {
  const isGood = deltaPct !== null && (goodWhen === "up" ? deltaPct >= 0 : deltaPct <= 0);
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: "var(--mute)" }}>
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {spark && spark.some((v) => v > 0) && <Sparkline values={spark} />}
      </div>
      {deltaPct !== null && (
        <p
          className="mt-1 text-xs font-medium tabular-nums"
          style={{ color: isGood ? "var(--ok)" : "var(--dang)" }}
        >
          {deltaPct > 0 ? "▲" : deltaPct < 0 ? "▼" : "—"} {Math.abs(deltaPct)} % vs période précédente
        </p>
      )}
    </div>
  );
}

/** Barres groupées quotidiennes — 2 séries, légende obligatoire, hover natif par jour. */
export function DailyBars({
  data,
  labelA,
  labelB,
}: {
  data: { day: string; created: number; resolved: number }[];
  labelA: string;
  labelB: string;
}) {
  const max = Math.max(...data.map((d) => Math.max(d.created, d.resolved)), 1);
  const barW = 7;
  const groupW = barW * 2 + 2 + 8; // 2 barres + écart 2px + espace inter-groupes
  const plotH = 110;
  const width = data.length * groupW;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const h = (v: number) => Math.max(v > 0 ? 3 : 0, (v / max) * plotH);
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div>
      {/* Légende — identité jamais portée par la couleur seule */}
      <div className="mb-2 flex gap-4 text-xs" style={{ color: "var(--mute)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--chart-1)" }} />
          {labelA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--chart-2)" }} />
          {labelB}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={plotH + 20}
          viewBox={`0 0 ${width} ${plotH + 20}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${labelA} et ${labelB} par jour`}
          style={{ minWidth: Math.min(width, 640) }}
        >
          {/* grille discrète */}
          {[0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={width}
              y1={plotH - f * plotH + 2}
              y2={plotH - f * plotH + 2}
              stroke="var(--line)"
              strokeWidth={1}
            />
          ))}
          {data.map((d, i) => {
            const x = i * groupW;
            return (
              <g key={d.day}>
                <title>{`${fmtDay(d.day)} — ${labelA} : ${d.created} · ${labelB} : ${d.resolved}`}</title>
                {/* zone de survol plus large que les marques */}
                <rect x={x} y={0} width={groupW} height={plotH} fill="transparent" />
                <rect
                  x={x + 2}
                  y={plotH - h(d.created)}
                  width={barW}
                  height={h(d.created)}
                  rx={2}
                  fill="var(--chart-1)"
                />
                <rect
                  x={x + 2 + barW + 2}
                  y={plotH - h(d.resolved)}
                  width={barW}
                  height={h(d.resolved)}
                  rx={2}
                  fill="var(--chart-2)"
                />
                {i % labelEvery === 0 && (
                  <text
                    x={x + groupW / 2}
                    y={plotH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--mute)"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtDay(d.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Liste à barres horizontales — une teinte (magnitude), libellés directs, valeurs tabulaires. */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-sm" title={`${item.label} : ${item.value}`}>
          <span className="w-24 shrink-0 truncate text-xs" style={{ color: "var(--mute)" }}>
            {item.label}
          </span>
          <span className="h-2 rounded-sm" style={{ width: `${(item.value / max) * 100}%`, minWidth: 3, background: "var(--chart-1)" }} />
          <span className="text-xs tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
