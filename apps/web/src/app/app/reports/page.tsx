import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, teams } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getReportData } from "@/lib/reports";
import { duration } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { Avatar } from "@/components/ticket-bits";
import {
  AreaLines,
  ChannelBars,
  ChartLegend,
  Heatmap,
  KpiTile,
  type KpiDelta,
} from "@/components/charts";

/**
 * AG-09 — Rapports (design « Espace agent ») : toolbar sticky padding 14/18 (segmented
 * 7 j / 30 j / 90 j / Personnalisé, équipe, comparaison, export CSV), 6 tuiles KPI
 * `repeat(6,1fr)` gap 10, rangée `1.6fr 1fr` (« Créés vs résolus » 190px + canaux),
 * rangée `1fr 1fr` (heatmap + performance agent), encart pointillé « PLAN PRO ».
 */

const PERIODS = [{ days: 7 }, { days: 30 }, { days: 90 }] as const;

const CHANNEL_COLORS: Record<string, string> = {
  email: "var(--acc-2)",
  portal: "var(--open)",
  widget: "var(--new)",
  api: "var(--pause)",
};

const CARD: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 10,
};
const CARD_TITLE: React.CSSProperties = { fontSize: 13.5, fontWeight: 600 };
const AGENT_COLS = "1fr 70px 90px 70px";

const fmtFr = (x: number, digits = 1) =>
  x.toLocaleString("fr-FR", { maximumFractionDigits: digits });

function pctDelta(
  t: Translate,
  cur: number | null,
  prev: number | null,
  goodWhen: "up" | "down" | "none",
): KpiDelta | null {
  if (cur === null || prev === null || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const text = t("app.reports.percentValue", {
    value: `${pct >= 0 ? "+" : "−"}${fmtFr(Math.abs(pct))}`,
  });
  const tone =
    goodWhen === "none" ? "neutral" : (goodWhen === "up" ? pct >= 0 : pct <= 0) ? "good" : "bad";
  return { text, tone };
}

function durationDelta(
  t: Translate,
  curSec: number | null,
  prevSec: number | null,
): KpiDelta | null {
  if (curSec === null || prevSec === null) return null;
  const diff = curSec - prevSec;
  if (Math.abs(diff) < 30) return { text: t("app.reports.deltaStable"), tone: "neutral" };
  const text = `${diff >= 0 ? "+" : "−"}${duration(t, Math.abs(diff) * 1000)}`;
  return { text, tone: diff <= 0 ? "good" : "bad" };
}

function pointsDelta(t: Translate, cur: number | null, prev: number | null): KpiDelta | null {
  if (cur === null || prev === null) return null;
  const diff = cur - prev;
  const text = t("app.reports.deltaPoints", {
    count: Math.abs(diff),
    value: `${diff >= 0 ? "+" : "−"}${fmtFr(Math.abs(diff))}`,
  });
  return { text, tone: diff >= 0 ? "good" : "bad" };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; team?: string; compare?: string }>;
}) {
  const t = await getT();
  const { tenant } = await requireAgent();
  const { p, team: teamParam, compare } = await searchParams;
  const days = PERIODS.find((x) => String(x.days) === p)?.days ?? 30;
  const showCompare = compare !== "0";

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenant.id))
    .orderBy(asc(teams.name));
  const teamId = teamRows.find((row) => row.id === teamParam)?.id;
  const currentTeam = teamRows.find((row) => row.id === teamId);

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

  const channelLabels: Record<string, string> = {
    email: t("app.reports.channelEmail"),
    portal: t("app.reports.channelPortal"),
    widget: t("app.reports.channelWidget"),
    api: t("app.reports.channelApi"),
  };

  const kpis: { label: string; value: string; delta: KpiDelta | null; spark?: number[] }[] = [
    {
      label: t("app.reports.kpiCreated"),
      value: t.fmt.number(current.created),
      delta: pctDelta(t, current.created, previous.created, "none"),
      spark: data.daily.map((d) => d.created),
    },
    {
      label: t("app.reports.kpiResolved"),
      value: t.fmt.number(current.resolved),
      delta: pctDelta(t, current.resolved, previous.resolved, "up"),
      spark: data.daily.map((d) => d.resolved),
    },
    {
      label: t("app.reports.kpiMedianFirstReply"),
      value:
        current.medianFirstReplySec !== null
          ? duration(t, current.medianFirstReplySec * 1000)
          : "—",
      delta: durationDelta(t, current.medianFirstReplySec, previous.medianFirstReplySec),
    },
    {
      label: t("app.reports.kpiMedianResolve"),
      value:
        current.medianResolveSec !== null ? duration(t, current.medianResolveSec * 1000) : "—",
      delta: durationDelta(t, current.medianResolveSec, previous.medianResolveSec),
    },
    {
      label: t("app.reports.kpiSlaCompliance"),
      value:
        current.slaCompliancePct !== null
          ? t("app.reports.percentValue", { value: fmtFr(current.slaCompliancePct) })
          : "—",
      delta: pointsDelta(t, current.slaCompliancePct, previous.slaCompliancePct),
    },
    {
      label: "CSAT",
      value:
        data.csatCurrent !== null
          ? t("app.reports.percentValue", { value: data.csatCurrent })
          : "—",
      delta: pointsDelta(t, data.csatCurrent, data.csatPrevious),
    },
  ];

  return (
    <div className="h-full overflow-auto" style={{ background: "var(--canvas)" }}>
      {/* Toolbar sticky */}
      <div
        className="sticky top-0 z-20 flex items-center"
        style={{
          gap: 8,
          padding: "14px 18px",
          background: "var(--panel)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {/* Segmented périodes */}
        <div
          className="flex"
          style={{ padding: 2, gap: 2, background: "var(--sunk)", borderRadius: 7 }}
        >
          {PERIODS.map(({ days: d }) => (
            <Link
              className="ohd-hover-edge-ink"
              key={d}
              href={buildUrl({ p: String(d) })}
              style={{
                padding: "5px 11px",
                borderRadius: 5,
                fontSize: 12.5,
                fontWeight: d === days ? 600 : 450,
                background: d === days ? "var(--panel)" : "transparent",
                color: d === days ? "var(--ink)" : "var(--ink-2)",
              }}
            >
              {t("app.reports.periodDays", { count: d })}
            </Link>
          ))}
          <span
            style={{
              padding: "5px 11px",
              borderRadius: 5,
              fontSize: 12.5,
              fontWeight: 450,
              color: "var(--ink-3)",
            }}
          >
            {t("app.reports.customPeriod")}
          </span>
        </div>

        {/* Équipe */}
        <details className="relative">
          <summary
            className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
            style={{
              height: 30,
              padding: "0 10px",
              gap: 6,
              border: "1px solid var(--line)",
              borderRadius: 6,
              fontSize: 12.5,
              color: "var(--ink-2)",
            }}
          >
            {t("app.reports.teamFilter", {
              team: currentTeam?.name ?? t("app.reports.allTeams"),
            })}
            <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
          </summary>
          <div
            className="absolute left-0 top-full z-30 mt-1 flex min-w-44 flex-col rounded-md border py-1 shadow-md"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            <Link href={buildUrl({ team: undefined })} className="px-3 py-1.5 text-[12.5px]">
              {t("app.reports.allTeams")}
            </Link>
            {teamRows.map((row) => (
              <Link
                key={row.id}
                href={buildUrl({ team: row.id })}
                className="px-3 py-1.5 text-[12.5px]"
                style={row.id === teamId ? { color: "var(--acc)", fontWeight: 600 } : undefined}
              >
                {row.name}
              </Link>
            ))}
          </div>
        </details>

        {/* Comparaison */}
        <Link
          href={buildUrl({ compare: showCompare ? "0" : undefined })}
          className="flex items-center"
          style={{ gap: 7, fontSize: 12.5, color: "var(--ink-2)", marginLeft: 4 }}
        >
          <span
            className="grid place-items-center"
            style={{
              width: 15,
              height: 15,
              borderRadius: 4,
              background: showCompare ? "var(--acc)" : "transparent",
              border: showCompare ? "none" : "1px solid var(--line)",
              color: "#fff",
              fontSize: 10,
            }}
          >
            {showCompare ? "✓" : ""}
          </span>
          {t("app.reports.compare")}
        </Link>

        <span className="flex-1" />
        <a
          href={exportUrl}
          className="grid place-items-center"
          style={{
            height: 30,
            padding: "0 11px",
            border: "1px solid var(--line)",
            borderRadius: 6,
            fontSize: 12.5,
            color: "var(--ink-2)",
          }}
        >
          {t("app.reports.exportCsv")}
        </a>
      </div>

      {data.dataSpanDays < 7 && (
        <p
          style={{
            margin: "14px 18px 0",
            padding: "10px 12px",
            background: "var(--wait-t)",
            border: "1px solid var(--wait)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--wait)",
          }}
        >
          {t("app.reports.shortSpanNotice")}
        </p>
      )}

      <div className="flex flex-col" style={{ padding: "16px 18px", gap: 16 }}>
        {/* Tuiles KPI */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 10,
          }}
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

        {/* Rangée 2 : Créés vs résolus · Répartition par canal */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
          <section className="flex min-w-0 flex-col" style={{ ...CARD, padding: 15, gap: 12 }}>
            <div className="flex items-baseline" style={{ gap: 10 }}>
              <div style={CARD_TITLE}>{t("app.reports.createdVsResolved")}</div>
              <ChartLegend
                items={[
                  { label: t("app.reports.seriesCreated"), color: "var(--open)" },
                  { label: t("app.reports.seriesResolved"), color: "var(--acc-2)" },
                ]}
              />
            </div>
            <div style={{ height: 190 }}>
              <AreaLines
                data={data.daily}
                labelA={t("app.reports.seriesCreated")}
                labelB={t("app.reports.seriesResolved")}
                t={t}
              />
            </div>
          </section>

          <section className="flex min-w-0 flex-col" style={{ ...CARD, padding: 15, gap: 12 }}>
            <div style={CARD_TITLE}>{t("app.reports.channelBreakdown")}</div>
            {data.channels.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("app.reports.noTickets")}</p>
            ) : (
              <ChannelBars
                t={t}
                items={data.channels.map((c) => ({
                  label: channelLabels[c.channel] ?? c.channel,
                  value: c.count,
                  color: CHANNEL_COLORS[c.channel] ?? "var(--closed)",
                }))}
              />
            )}
          </section>
        </div>

        {/* Rangée 3 : heatmap · performance par agent */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <section className="flex min-w-0 flex-col" style={{ ...CARD, padding: 15, gap: 12 }}>
            <div style={CARD_TITLE}>{t("app.reports.hourDayVolume")}</div>
            <Heatmap grid={data.heatmap} hours={data.heatmapHours} t={t} />
          </section>

          <section
            className="flex min-w-0 flex-col"
            style={{ ...CARD, padding: "15px 0 5px", gap: 10 }}
          >
            <div style={{ ...CARD_TITLE, padding: "0 15px" }}>{t("app.reports.agentPerformance")}</div>
            {data.agents.length === 0 ? (
              <p style={{ padding: "0 15px", fontSize: 12.5, color: "var(--ink-3)" }}>
                {t("app.reports.noAgentActivity")}
              </p>
            ) : (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: AGENT_COLS,
                    padding: "0 15px",
                    height: 26,
                    alignItems: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--ink-3)",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div>{t("app.reports.columnAgent")}</div>
                  <div style={{ textAlign: "right" }}>{t("app.reports.seriesResolved")}</div>
                  <div style={{ textAlign: "right" }}>{t("app.reports.columnFirstReply")}</div>
                  <div style={{ textAlign: "right" }}>CSAT</div>
                </div>
                {data.agents.map((a, i) => (
                  <div
                    key={a.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: AGENT_COLS,
                      padding: "0 15px",
                      height: 34,
                      alignItems: "center",
                      fontSize: 12.5,
                      borderBottom: "1px solid var(--line-2)",
                    }}
                  >
                    <div className="flex min-w-0 items-center" style={{ gap: 8 }}>
                      <Avatar name={a.name} size={20} tone={i} />
                      <span className="truncate">{a.name}</span>
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {t.fmt.number(a.resolved)}
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {a.medianFirstReplySec !== null
                        ? duration(t, a.medianFirstReplySec * 1000)
                        : "—"}
                    </div>
                    <div
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
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
                      {a.csatPct !== null
                        ? t("app.reports.percentValue", { value: a.csatPct })
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Tuile verrouillée « PLAN PRO » */}
        <div
          className="flex items-center"
          style={{
            gap: 11,
            padding: "13px 15px",
            background: "var(--panel)",
            border: "1px dashed var(--line)",
            borderRadius: 10,
            opacity: 0.75,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{t("app.reports.customReports")}</div>
          <span
            style={{
              padding: "1px 8px",
              borderRadius: 20,
              background: "var(--new-t)",
              color: "var(--new)",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".04em",
            }}
          >
            {t("app.reports.proPlanBadge")}
          </span>
          <span className="flex-1" />
          <Link href="/app/settings/billing" style={{ fontSize: 12.5 }}>
            {t("app.reports.discover")}
          </Link>
        </div>
      </div>
    </div>
  );
}
