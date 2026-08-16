import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { getReportData } from "@/lib/reports";
import { durationFr } from "@/lib/format";
import { BarList, DailyBars, KpiTile } from "@/components/charts";

const PERIODS = [
  { days: 7, label: "7 j" },
  { days: 30, label: "30 j" },
  { days: 90, label: "90 j" },
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  portal: "Portail",
  widget: "Widget",
  api: "API",
};

function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * AG-09 — Rapports (specs/10) : tuiles KPI avec delta et sparkline, créés vs résolus
 * par jour, répartition par canal, tableau par agent, top tags. Export CSV et heatmap
 * horaire à venir ; « rapports personnalisés » = plan Pro (V2).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { p } = await searchParams;
  const days = PERIODS.find((x) => String(x.days) === p)?.days ?? 30;
  const data = await getReportData(tenant.id, days);
  const { current, previous } = data;

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b px-5"
        style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
      >
        <h1 className="text-sm font-semibold">Rapports</h1>
        <span className="flex-1" />
        <div className="flex gap-1">
          {PERIODS.map(({ days: d, label }) => (
            <Link
              key={d}
              href={`/app/reports?p=${d}`}
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={
                d === days
                  ? { background: "var(--acc-t)", color: "var(--acc)" }
                  : { color: "var(--mute)" }
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-5">
        {current.created < 5 && (
          <p
            className="mb-4 rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: "var(--line)", background: "var(--sunk)", color: "var(--mute)" }}
          >
            Peu de données sur la période — les tendances s'affineront avec l'usage.
          </p>
        )}

        {/* Tuiles KPI */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiTile
            label="Tickets créés"
            value={String(current.created)}
            deltaPct={deltaPct(current.created, previous.created)}
            spark={data.daily.map((d) => d.created)}
          />
          <KpiTile
            label="Tickets résolus"
            value={String(current.resolved)}
            deltaPct={deltaPct(current.resolved, previous.resolved)}
            spark={data.daily.map((d) => d.resolved)}
          />
          <KpiTile
            label="1ʳᵉ réponse (médiane)"
            value={
              current.medianFirstReplySec !== null
                ? durationFr(current.medianFirstReplySec * 1000)
                : "—"
            }
            deltaPct={deltaPct(current.medianFirstReplySec, previous.medianFirstReplySec)}
            goodWhen="down"
          />
          <KpiTile
            label="Résolution (médiane)"
            value={
              current.medianResolveSec !== null ? durationFr(current.medianResolveSec * 1000) : "—"
            }
            deltaPct={deltaPct(current.medianResolveSec, previous.medianResolveSec)}
            goodWhen="down"
          />
          <KpiTile
            label="Conformité SLA"
            value={current.slaCompliancePct !== null ? `${current.slaCompliancePct} %` : "—"}
            deltaPct={deltaPct(current.slaCompliancePct, previous.slaCompliancePct)}
          />
          <KpiTile
            label="CSAT"
            value={data.csatCurrent !== null ? `${data.csatCurrent} %` : "—"}
            deltaPct={deltaPct(data.csatCurrent, data.csatPrevious)}
          />
        </div>

        {/* Créés vs résolus */}
        <section
          className="mt-4 rounded-lg border p-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <p className="mb-3 text-sm font-semibold">Créés vs résolus, par jour</p>
          <DailyBars data={data.daily} labelA="Créés" labelB="Résolus" />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section
            className="rounded-lg border p-4"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-sm font-semibold">Par canal</p>
            {data.channels.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--mute)" }}>
                Aucun ticket sur la période.
              </p>
            ) : (
              <BarList
                items={data.channels.map((c) => ({
                  label: CHANNEL_LABELS[c.channel] ?? c.channel,
                  value: c.count,
                }))}
              />
            )}
          </section>

          <section
            className="rounded-lg border p-4"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <p className="mb-3 text-sm font-semibold">Top tags</p>
            {data.tags.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--mute)" }}>
                Aucun tag sur la période.
              </p>
            ) : (
              <BarList items={data.tags.map((t) => ({ label: t.tag, value: t.count }))} />
            )}
          </section>
        </div>

        {/* Par agent */}
        <section
          className="mt-4 rounded-lg border p-4"
          style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        >
          <p className="mb-3 text-sm font-semibold">Par agent</p>
          {data.agents.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--mute)" }}>
              Aucune activité agent sur la période.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left font-mono text-[11px] uppercase tracking-wider"
                  style={{ borderColor: "var(--line)", color: "var(--mute)" }}
                >
                  <th className="py-1.5 font-semibold">Agent</th>
                  <th className="text-right font-semibold">Résolus</th>
                  <th className="text-right font-semibold">1ʳᵉ réponse méd.</th>
                  <th className="text-right font-semibold">CSAT</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.agents.map((a) => (
                  <tr key={a.name} className="border-b" style={{ borderColor: "var(--line)" }}>
                    <td className="py-2 font-medium">{a.name}</td>
                    <td className="text-right">{a.resolved}</td>
                    <td className="text-right">
                      {a.medianFirstReplySec !== null
                        ? durationFr(a.medianFirstReplySec * 1000)
                        : "—"}
                    </td>
                    <td className="text-right">{a.csatPct !== null ? `${a.csatPct} %` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
