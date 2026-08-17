import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, teams } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getReportData } from "@/lib/reports";
import { durationFr, nFr } from "@/lib/format";
import { AreaLines, ChannelBars, Heatmap, KpiTile, type KpiDelta } from "@/components/charts";

/**
 * AG-09 — Rapports (design espace-agent) : toolbar sticky (segmented périodes, équipe,
 * comparaison, export CSV), 6 tuiles KPI, « Créés vs résolus » en aires + lignes,
 * répartition par canal, heatmap heure × jour, performance par agent, tuile PLAN PRO.
 */

const PERIODS = [
  { days: 7, label: "7 j" },
  { days: 30, label: "30 j" },
  { days: 90, label: "90 j" },
] as const;

const CHANNELS: Record<string, { label: string; color: string }> = {
  email: { label: "Email", color: "var(--acc-2)" },
  portal: { label: "Portail", color: "var(--open)" },
  widget: { label: "Widget", color: "var(--new)" },
  api: { label: "API", color: "var(--pause)" },
};

const fmtFr = (x: number, digits = 1) =>
  x.toLocaleString("fr-FR", { maximumFractionDigits: digits });

function pctDelta(cur: number | null, prev: number | null, goodWhen: "up" | "down" | "none"): KpiDelta | null {
  if (cur === null || prev === null || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const text = `${pct >= 0 ? "+" : "−"}${fmtFr(Math.abs(pct))} %`;
  const tone =
    goodWhen === "none" ? "neutral" : (goodWhen === "up" ? pct >= 0 : pct <= 0) ? "good" : "bad";
  return { text, tone };
}

function durationDelta(curSec: number | null, prevSec: number | null): KpiDelta | null {
  if (curSec === null || prevSec === null) return null;
  const diff = curSec - prevSec;
  if (Math.abs(diff) < 30) return { text: "stable", tone: "neutral" };
  const text = `${diff >= 0 ? "+" : "−"}${durationFr(Math.abs(diff) * 1000)}`;
  return { text, tone: diff <= 0 ? "good" : "bad" };
}

function pointsDelta(cur: number | null, prev: number | null, unit: string): KpiDelta | null {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  const text = `${diff >= 0 ? "+" : "−"}${fmtFr(Math.abs(diff))} ${unit}`;
  return { text, tone: diff >= 0 ? "good" : "bad" };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; team?: string; compare?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { p, team: teamParam, compare } = await searchParams;
  const days = PERIODS.find((x) => String(x.days) === p)?.days ?? 30;
  const showCompare = compare !== "0";

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenant.id))
    .orderBy(asc(teams.name));
  const teamId = teamRows.find((t) => t.id === teamParam)?.id;
  const currentTeam = teamRows.find((t) => t.id === teamId);

  const data = await getReportData(tenant.id, days, teamId);
  const { current, previous } = data;

  const buildUrl = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      p: String(days),
      team: teamId,
      compare: showCompare ? undefined : "0",
      ...patch,
    };
    const q = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
    return `/app/reports${q ? `?${q}` : ""}`;
  };

  const exportUrl = `/api/agent-reports/export?p=${days}${teamId ? `&team=${teamId}` : ""}`;

  const kpis: { label: string; value: string; delta: KpiDelta | null; spark?: number[] }[] = [
    {
      label: "Tickets créés",
      value: nFr(current.created),
      delta: pctDelta(current.created, previous.created, "none"),
      spark: data.daily.map((d) => d.created),
    },
    {
      label: "Résolus",
      value: nFr(current.resolved),
      delta: pctDelta(current.resolved, previous.resolved, "up"),
      spark: data.daily.map((d) => d.resolved),
    },
    {
      label: "1ʳᵉ réponse médiane",
      value:
        current.medianFirstReplySec !== null
          ? durationFr(current.medianFirstReplySec * 1000)
          : "—",
      delta: durationDelta(current.medianFirstReplySec, previous.medianFirstReplySec),
    },
    {
      label: "Résolution médiane",
      value:
        current.medianResolveSec !== null ? durationFr(current.medianResolveSec * 1000) : "—",
      delta: durationDelta(current.medianResolveSec, previous.medianResolveSec),
    },
    {
      label: "Conformité SLA",
      value: current.slaCompliancePct !== null ? `${fmtFr(current.slaCompliancePct)} %` : "—",
      delta: pointsDelta(current.slaCompliancePct, previous.slaCompliancePct, "pt"),
    },
    {
      label: "CSAT",
      value: data.csatCurrent !== null ? `${data.csatCurrent} %` : "—",
      delta: pointsDelta(data.csatCurrent, data.csatPrevious, "pts"),
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      {/* Toolbar sticky */}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b px-4"
        style={{ minHeight: 48, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        {/* Segmented périodes */}
        <div
          className="flex items-center gap-0.5 rounded-md border p-0.5"
          style={{ borderColor: "var(--line)", background: "var(--sunk)" }}
        >
          {PERIODS.map(({ days: d, label }) => (
            <Link
              key={d}
              href={buildUrl({ p: String(d) })}
              className="rounded px-2.5 py-1 text-[12.5px] font-medium"
              style={
                d === days
                  ? { background: "var(--bg)", color: "var(--ink)", boxShadow: "0 0 0 1px var(--line)" }
                  : { color: "var(--ink-3)" }
              }
            >
              {label}
            </Link>
          ))}
          <span className="rounded px-2.5 py-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            Personnalisé
          </span>
        </div>

        {/* Équipe */}
        <details className="relative">
          <summary
            className="flex cursor-pointer list-none items-center gap-1 rounded-md border px-2.5 text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
            style={{
              height: 28,
              borderColor: "var(--line)",
              background: "var(--bg)",
              color: "var(--ink-2)",
            }}
          >
            Équipe : {currentTeam?.name ?? "toutes"} <span style={{ fontSize: 9 }}>▾</span>
          </summary>
          <div
            className="absolute left-0 top-full z-30 mt-1 flex min-w-44 flex-col rounded-md border py-1 shadow-md"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <Link href={buildUrl({ team: undefined })} className="px-3 py-1.5 text-[12.5px]">
              toutes
            </Link>
            {teamRows.map((t) => (
              <Link
                key={t.id}
                href={buildUrl({ team: t.id })}
                className="px-3 py-1.5 text-[12.5px]"
                style={t.id === teamId ? { color: "var(--acc)", fontWeight: 600 } : undefined}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </details>

        {/* Comparaison */}
        <Link
          href={buildUrl({ compare: showCompare ? "0" : undefined })}
          className="flex items-center gap-1.5 text-[12.5px]"
          style={{ color: "var(--ink-2)" }}
        >
          <span
            className="flex items-center justify-center rounded"
            style={{
              width: 14,
              height: 14,
              border: showCompare ? "none" : "1.5px solid var(--line)",
              background: showCompare ? "var(--acc)" : "var(--bg)",
              color: "#fff",
              fontSize: 10,
            }}
          >
            {showCompare ? "✓" : ""}
          </span>
          Comparer à la période précédente
        </Link>

        <span className="flex-1" />
        <a
          href={exportUrl}
          className="rounded-md border px-3 text-[12.5px] font-medium leading-7"
          style={{
            height: 28,
            borderColor: "var(--line)",
            background: "var(--bg)",
            color: "var(--ink-2)",
          }}
        >
          Export CSV
        </a>
      </div>

      <div className="mx-auto max-w-6xl p-4">
        {data.dataSpanDays < 7 && (
          <p
            className="mb-4 rounded-md border px-3 py-2 text-[12.5px]"
            style={{
              borderColor: "var(--wait)",
              background: "var(--wait-t)",
              color: "var(--wait)",
            }}
          >
            Moins de 7 jours de données — les tendances s'affineront avec l'usage.
          </p>
        )}

        {/* Tuiles KPI */}
        <div className="overflow-x-auto">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(6, 1fr)", minWidth: 880 }}
          >
            {kpis.map((k) => (
              <KpiTile
                key={k.label}
                label={k.label}
                value={k.value}
                delta={showCompare ? k.delta : null}
                spark={k.spark}
              />
            ))}
          </div>
        </div>

        {/* Rangée 2 : Créés vs résolus · Répartition par canal */}
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
          <section
            className="border p-4"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-[13px] font-semibold">Créés vs résolus</p>
            <AreaLines data={data.daily} labelA="Créés" labelB="Résolus" />
          </section>

          <section
            className="border p-4"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-[13px] font-semibold">Répartition par canal</p>
            {data.channels.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Aucun ticket sur la période.</p>
            ) : (
              <ChannelBars
                items={data.channels.map((c) => ({
                  label: CHANNELS[c.channel]?.label ?? c.channel,
                  value: c.count,
                  color: CHANNELS[c.channel]?.color ?? "var(--closed)",
                }))}
              />
            )}
          </section>
        </div>

        {/* Rangée 3 : heatmap · performance par agent */}
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <section
            className="border p-4"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-[13px] font-semibold">Volume par heure et jour</p>
            <Heatmap grid={data.heatmap} hours={data.heatmapHours} />
          </section>

          <section
            className="border p-4"
            style={{ borderRadius: 10, background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-[13px] font-semibold">Performance par agent</p>
            {data.agents.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Aucune activité agent sur la période.
              </p>
            ) : (
              <div>
                <div
                  className="grid border-b pb-1.5 font-semibold uppercase tracking-wide"
                  style={{
                    gridTemplateColumns: "1fr 70px 90px 70px",
                    fontSize: 10.5,
                    color: "var(--ink-3)",
                    borderColor: "var(--line)",
                  }}
                >
                  <span>Agent</span>
                  <span className="text-right">Résolus</span>
                  <span className="text-right">1ʳᵉ rép.</span>
                  <span className="text-right">CSAT</span>
                </div>
                {data.agents.map((a) => (
                  <div
                    key={a.name}
                    className="grid items-center border-b py-2 tabular-nums"
                    style={{
                      gridTemplateColumns: "1fr 70px 90px 70px",
                      fontSize: 12.5,
                      borderColor: "var(--line-2)",
                    }}
                  >
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="text-right">{nFr(a.resolved)}</span>
                    <span className="text-right">
                      {a.medianFirstReplySec !== null
                        ? durationFr(a.medianFirstReplySec * 1000)
                        : "—"}
                    </span>
                    <span
                      className="text-right font-semibold"
                      style={{
                        color:
                          a.csatPct === null
                            ? "var(--ink-3)"
                            : a.csatPct >= 90
                              ? "var(--ok)"
                              : a.csatPct >= 86
                                ? "var(--ink)"
                                : "var(--wait)",
                      }}
                    >
                      {a.csatPct !== null ? `${a.csatPct} %` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Tuile verrouillée */}
        <section
          className="mt-4 flex items-center gap-3 border border-dashed p-4"
          style={{ borderRadius: 10, borderColor: "var(--line)" }}
        >
          <span style={{ fontSize: 18 }}>🔒</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              Rapports personnalisés
              <span
                className="rounded-full px-2 py-0.5 font-bold"
                style={{
                  fontSize: 9.5,
                  background: "var(--new-t)",
                  color: "var(--new)",
                  letterSpacing: "0.05em",
                }}
              >
                PLAN PRO
              </span>
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Construisez vos propres tableaux : dimensions, filtres et exports planifiés.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border px-3 py-1.5 text-[12.5px] font-medium"
            style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
          >
            Découvrir
          </button>
        </section>
      </div>
    </div>
  );
}
