import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, teams } from "@openhelpdesk/db";
import { isCloud } from "@openhelpdesk/config";
import { requireAgent } from "@/lib/session";
import { getReportData } from "@/lib/reports";
import { duration } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { Avatar } from "@/components/ticket-bits";
import { card, groupLabel, PageHeader, PageShell } from "@/components/v2-page";
import {
  bucketDaily,
  BucketBars,
  ChannelBars,
  ChartLegend,
  Heatmap,
  KpiTile,
  MeterRow,
  type KpiDelta,
} from "@/components/charts";

/**
 * AG-09 — Reports (V2): the 1080 px column of the other list screens, four KPI
 * tiles, then "created vs solved" beside the satisfaction card, the two
 * distributions the mockup does not draw (channel, hour × day), and performance
 * per agent as a card table.
 *
 * Two things the mockup asserts and the product cannot: a "business hours only"
 * subtitle (the medians are wall-clock) and a neutral CSAT rating (the score has
 * two values). Both are left out rather than displayed as a claim nothing backs.
 *
 * The mockup's fourth tile, "SLA breached", is a count we do not keep; what we do
 * keep is the compliance rate, and it reads better under the CSAT figure than as
 * a fifth tile — which is where the mockup puts it too.
 */

const PERIODS = [7, 30, 90] as const;

const CHANNEL_COLORS: Record<string, string> = {
  email: "var(--brand-2)",
  portal: "var(--open)",
  widget: "var(--viol)",
  api: "var(--pause)",
};

const AGENT_COLS = "minmax(180px,1.2fr) 100px 120px 150px 100px";
const AGENT_MIN_WIDTH = 700;

/** Card of the V2 grid — radius 14, padding 18, uppercase group title. */
const chartCard = { ...card, padding: 18, display: "flex", flexDirection: "column" as const, gap: 13 };

function pctDelta(
  t: Translate,
  cur: number | null,
  prev: number | null,
  goodWhen: "up" | "down" | "none",
): KpiDelta | null {
  if (cur === null || prev === null || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const text = t("app.reports.percentValue", {
    value: `${pct >= 0 ? "+" : "−"}${t.fmt.decimal(Math.abs(pct))}`,
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
    value: `${diff >= 0 ? "+" : "−"}${t.fmt.decimal(Math.abs(diff))}`,
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
  const days = PERIODS.find((d) => String(d) === p) ?? 30;
  const showCompare = compare !== "0";

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.tenantId, tenant.id))
    .orderBy(asc(teams.name));
  const teamId = teamRows.find((row) => row.id === teamParam)?.id;
  const currentTeam = teamRows.find((row) => row.id === teamId);

  const data = await getReportData(tenant.id, days, teamId);
  const { current, previous, csatBreakdown } = data;

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
  ];

  // A week of days, then weeks: 90 daily bars would be unreadable and unlabelable.
  const buckets = bucketDaily(data.daily, days <= 7 ? 1 : 7);

  const [slaBefore, slaAfter] = t.parts("app.reports.firstReplySla", "value");

  return (
    <PageShell>
      <PageHeader
        title={t("app.shell.reports")}
        subtitle={t("app.reports.subtitle")}
        actions={
          <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
            {/* Segmented periods */}
            <div
              className="flex"
              style={{ gap: 2, padding: 3, background: "var(--sunk)", borderRadius: 9 }}
            >
              {PERIODS.map((d) => (
                <Link
                  key={d}
                  href={buildUrl({ p: String(d) })}
                  style={{
                    padding: "6px 13px",
                    borderRadius: 7,
                    fontSize: 12.5,
                    fontWeight: d === days ? 600 : 450,
                    background: d === days ? "var(--panel)" : "transparent",
                    color: d === days ? "var(--ink)" : "var(--ink-3)",
                    boxShadow: d === days ? "0 1px 2px rgba(13,28,23,.08)" : undefined,
                  }}
                >
                  {t("app.reports.periodDays", { count: d })}
                </Link>
              ))}
            </div>

            {/* Team */}
            <details className="relative">
              <summary
                className="ohd-hover-edge-ink flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
                style={{
                  height: 36,
                  padding: "0 12px",
                  gap: 6,
                  border: "1px solid var(--line)",
                  borderRadius: 9,
                  background: "var(--panel)",
                  fontSize: 13,
                  color: "var(--ink-2)",
                }}
              >
                {t("app.reports.teamFilter", {
                  team: currentTeam?.name ?? t("app.reports.allTeams"),
                })}
                <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
              </summary>
              <div
                className="absolute left-0 top-full z-30 mt-1 flex min-w-48 flex-col py-1"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,.14)",
                }}
              >
                <Link href={buildUrl({ team: undefined })} className="px-3 py-1.5 text-[13px]">
                  {t("app.reports.allTeams")}
                </Link>
                {teamRows.map((row) => (
                  <Link
                    key={row.id}
                    href={buildUrl({ team: row.id })}
                    className="px-3 py-1.5 text-[13px]"
                    style={
                      row.id === teamId ? { color: "var(--brand)", fontWeight: 600 } : undefined
                    }
                  >
                    {row.name}
                  </Link>
                ))}
              </div>
            </details>

            {/* Comparison */}
            <Link
              href={buildUrl({ compare: showCompare ? "0" : undefined })}
              className="flex items-center"
              style={{ gap: 7, fontSize: 13, color: "var(--ink-2)" }}
            >
              <span
                className="grid place-items-center"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: showCompare ? "var(--brand)" : "transparent",
                  border: showCompare ? "none" : "1px solid var(--line)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {showCompare ? "✓" : ""}
              </span>
              {t("app.reports.compare")}
            </Link>

            <a
              href={exportUrl}
              className="ohd-hover-edge-ink flex items-center"
              style={{
                height: 36,
                padding: "0 14px",
                border: "1px solid var(--line)",
                borderRadius: 9,
                background: "var(--panel)",
                fontSize: 13,
              }}
            >
              ↓ {t("app.reports.exportCsv")}
            </a>
          </div>
        }
      />

      {data.dataSpanDays < 7 && (
        <p
          style={{
            padding: "10px 12px",
            background: "var(--wait-t)",
            border: "1px solid var(--wait)",
            borderRadius: 9,
            fontSize: 13,
            color: "var(--wait)",
          }}
        >
          {t("app.reports.shortSpanNotice")}
        </p>
      )}

      {/* Four KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
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

      {/* Created vs solved · Satisfaction */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12 }}>
        <section className="min-w-0" style={chartCard}>
          <div style={groupLabel}>{t("app.reports.createdVsResolved")}</div>
          <BucketBars
            data={buckets}
            labelA={t("app.reports.seriesCreated")}
            labelB={t("app.reports.seriesResolved")}
            t={t}
          />
          <ChartLegend
            items={[
              { label: t("app.reports.seriesCreated"), color: "var(--series-mute)" },
              { label: t("app.reports.seriesResolved"), color: "var(--brand)" },
            ]}
          />
        </section>

        <section className="min-w-0" style={chartCard}>
          <div style={groupLabel}>{t("app.settings.portal.csatTitle")}</div>
          {csatBreakdown.total === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{t("app.reports.noCsat")}</p>
          ) : (
            <>
              <div className="flex items-baseline" style={{ gap: 8 }}>
                <span
                  style={{
                    fontFamily: "var(--font-title)",
                    fontSize: 36,
                    fontWeight: 600,
                    color: "var(--brand)",
                  }}
                >
                  {t("app.reports.percentValue", { value: data.csatCurrent ?? 0 })}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {t("app.reports.csatResponses", { count: csatBreakdown.total })}
                </span>
              </div>
              <MeterRow
                label={t("csat.satisfied")}
                value={csatBreakdown.good}
                total={csatBreakdown.total}
                color="var(--ok)"
                t={t}
              />
              <MeterRow
                label={t("csat.unsatisfied")}
                value={csatBreakdown.bad}
                total={csatBreakdown.total}
                color="var(--dang)"
                t={t}
              />
            </>
          )}
          {/* The mockup closes this card with the first-reply SLA, and it belongs
              here: satisfaction and the promise made to the customer are read
              together. */}
          <div
            style={{
              borderTop: "1px solid var(--line-2)",
              paddingTop: 11,
              marginTop: "auto",
              fontSize: 12.5,
              color: "var(--ink-2)",
            }}
          >
            {slaBefore}
            <strong style={{ fontWeight: 600, color: "var(--ok)" }}>
              {current.slaCompliancePct !== null
                ? t("app.reports.percentValue", { value: t.fmt.decimal(current.slaCompliancePct) })
                : "—"}
            </strong>
            {slaAfter}
          </div>
        </section>
      </div>

      {/* The two distributions: the mockup drops them, the product keeps them. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section className="min-w-0" style={chartCard}>
          <div style={groupLabel}>{t("app.reports.channelBreakdown")}</div>
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

        <section className="min-w-0" style={chartCard}>
          <div style={groupLabel}>{t("app.reports.hourDayVolume")}</div>
          <Heatmap grid={data.heatmap} hours={data.heatmapHours} t={t} />
        </section>
      </div>

      {/* Performance per agent */}
      {data.agents.length === 0 ? (
        <div style={{ ...card, padding: 18 }}>
          <div style={{ ...groupLabel, marginBottom: 10 }}>
            {t("app.reports.agentPerformance")}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {t("app.reports.noAgentActivity")}
          </p>
        </div>
      ) : (
        <div style={{ ...card, overflowX: "auto" }}>
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: AGENT_COLS,
              minWidth: AGENT_MIN_WIDTH,
              padding: "0 18px",
              height: 40,
              background: "var(--canvas)",
              borderBottom: "1px solid var(--line)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--ink-3)",
              letterSpacing: ".09em",
              textTransform: "uppercase",
            }}
          >
            <div>{t("app.reports.columnAgent")}</div>
            <div>{t("app.reports.seriesResolved")}</div>
            <div>{t("app.reports.columnFirstReply")}</div>
            <div>{t("app.reports.kpiMedianResolve")}</div>
            <div style={{ textAlign: "right" }}>CSAT</div>
          </div>
          {data.agents.map((a, i) => (
            <div
              key={a.name}
              className="grid items-center"
              style={{
                gridTemplateColumns: AGENT_COLS,
                minWidth: AGENT_MIN_WIDTH,
                padding: "0 18px",
                minHeight: 50,
                borderBottom:
                  i < data.agents.length - 1 ? "1px solid var(--line-2)" : undefined,
                fontSize: 13.5,
              }}
            >
              <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
                <Avatar name={a.name} size={28} fontSize={10} tone={i} />
                <span className="truncate" style={{ fontWeight: 600 }}>
                  {a.name}
                </span>
              </div>
              <div className="tabular-nums">{t.fmt.number(a.resolved)}</div>
              <div className="tabular-nums" style={{ color: "var(--ink-2)" }}>
                {a.medianFirstReplySec !== null
                  ? duration(t, a.medianFirstReplySec * 1000)
                  : "—"}
              </div>
              <div className="tabular-nums" style={{ color: "var(--ink-2)" }}>
                {a.medianResolveSec !== null ? duration(t, a.medianResolveSec * 1000) : "—"}
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
                {a.csatPct !== null ? t("app.reports.percentValue", { value: a.csatPct }) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Locked "Enterprise edition" tile */}
      <div
        className="flex items-center"
        style={{
          gap: 11,
          padding: "13px 16px",
          background: "var(--panel)",
          border: "1px dashed var(--line)",
          borderRadius: 14,
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
            background: "var(--viol-t)",
            color: "var(--viol)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: ".04em",
          }}
        >
          {t("app.reports.enterpriseEditionBadge")}
        </span>
        <span className="flex-1" />
        {/* The CTA leads to ST-11, invisible when self-hosted: no dead link. */}
        {isCloud() && (
          <Link href="/app/settings/billing" style={{ fontSize: 12.5 }}>
            {t("app.reports.discover")}
          </Link>
        )}
      </div>
    </PageShell>
  );
}
