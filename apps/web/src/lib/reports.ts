/**
 * AG-09 queries — Reports. Current window + previous window for the deltas,
 * optional team filter, hour × day heatmap, data boundary for the 7-day banner.
 */
import { db } from "@openhelpdesk/db";
import { sql, type SQL } from "drizzle-orm";

export type ReportData = Awaited<ReturnType<typeof getReportData>>;

type Row = Record<string, unknown>;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function getReportData(tenantId: string, days: number, teamId?: string) {
  const teamFilter: SQL = teamId ? sql` and team_id = ${teamId}` : sql``;
  const teamFilterT: SQL = teamId ? sql` and t.team_id = ${teamId}` : sql``;

  const windowFor = (offset: number) => ({
    from: sql`now() - make_interval(days => ${days * (offset + 1)})`,
    to: sql`now() - make_interval(days => ${days * offset})`,
  });

  async function metrics(offset: number) {
    const { from, to } = windowFor(offset);
    const rows = (await db.execute(sql`
      select
        count(*) filter (where created_at >= ${from} and created_at < ${to}) as created,
        count(*) filter (where resolved_at >= ${from} and resolved_at < ${to}) as resolved,
        percentile_cont(0.5) within group (order by extract(epoch from (first_replied_at - created_at)))
          filter (where first_replied_at >= ${from} and first_replied_at < ${to}) as median_first_reply_sec,
        percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - created_at)))
          filter (where resolved_at >= ${from} and resolved_at < ${to}) as median_resolve_sec,
        count(*) filter (where resolved_at >= ${from} and resolved_at < ${to}
          and (resolve_due_at is null or resolved_at <= resolve_due_at)
          and (first_reply_due_at is null or (first_replied_at is not null and first_replied_at <= first_reply_due_at))
        ) as sla_ok
      from app.tickets
      where tenant_id = ${tenantId} and deleted_at is null and merged_into_id is null${teamFilter}
    `)) as unknown as Row[];
    const r = rows[0] ?? {};
    const resolved = n(r.resolved);
    return {
      created: n(r.created),
      resolved,
      medianFirstReplySec: r.median_first_reply_sec === null ? null : n(r.median_first_reply_sec),
      medianResolveSec: r.median_resolve_sec === null ? null : n(r.median_resolve_sec),
      slaCompliancePct:
        resolved > 0 ? Math.round((n(r.sla_ok) / resolved) * 1000) / 10 : null,
    };
  }

  async function csat(offset: number) {
    const { from, to } = windowFor(offset);
    const rows = (await db.execute(sql`
      select count(*) as total, count(*) filter (where score = 'good') as good
      from app.csat_responses
      where tenant_id = ${tenantId} and created_at >= ${from} and created_at < ${to}
    `)) as unknown as Row[];
    const total = n(rows[0]?.total);
    const good = n(rows[0]?.good);
    // The score enum has two values, so "bad" is the complement — the V2 card
    // draws two bars and not the mockup's three (there is no neutral rating to
    // report, and inventing one would put a zero next to a label nothing feeds).
    return { total, good, bad: total - good, pct: total > 0 ? Math.round((good / total) * 100) : null };
  }

  const [current, previous, csatNow, csatBefore] = await Promise.all([
    metrics(0),
    metrics(1),
    csat(0),
    csat(1),
  ]);

  const daily = (await db.execute(sql`
    select d::date as day,
      (select count(*) from app.tickets t where t.tenant_id = ${tenantId}
        and t.created_at >= d and t.created_at < d + interval '1 day'${teamFilterT}) as created,
      (select count(*) from app.tickets t where t.tenant_id = ${tenantId}
        and t.resolved_at >= d and t.resolved_at < d + interval '1 day'${teamFilterT}) as resolved
    from generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}),
                         date_trunc('day', now()), interval '1 day') as d
    order by d
  `)) as unknown as Row[];

  const channels = (await db.execute(sql`
    select channel, count(*) as count from app.tickets
    where tenant_id = ${tenantId} and created_at >= now() - make_interval(days => ${days})${teamFilter}
    group by channel order by count desc
  `)) as unknown as Row[];

  // The two aggregates are computed SEPARATELY: joining tickets and CSAT responses
  // in the same query multiplies the rows (N tickets × M responses) and inflates
  // the number of tickets resolved per agent.
  const agents = (await db.execute(sql`
    with per_ticket as (
      select t.assignee_id as agent_id,
        count(*) filter (where t.resolved_at >= now() - make_interval(days => ${days})) as resolved,
        percentile_cont(0.5) within group (order by extract(epoch from (t.first_replied_at - t.created_at)))
          filter (where t.first_replied_at >= now() - make_interval(days => ${days})) as median_first_reply_sec,
        percentile_cont(0.5) within group (order by extract(epoch from (t.resolved_at - t.created_at)))
          filter (where t.resolved_at >= now() - make_interval(days => ${days})) as median_resolve_sec
      from app.tickets t
      where t.tenant_id = ${tenantId} and t.assignee_id is not null
        and t.deleted_at is null and t.merged_into_id is null${teamFilterT}
      group by t.assignee_id
    ),
    per_csat as (
      select c.agent_id,
        count(*) filter (where c.score = 'good') as csat_good,
        count(*) as csat_total
      from app.csat_responses c
      where c.tenant_id = ${tenantId} and c.agent_id is not null
        and c.created_at >= now() - make_interval(days => ${days})
      group by c.agent_id
    )
    select u.name,
      coalesce(pt.resolved, 0) as resolved,
      pt.median_first_reply_sec,
      pt.median_resolve_sec,
      coalesce(pc.csat_good, 0) as csat_good,
      coalesce(pc.csat_total, 0) as csat_total
    from app.users u
    left join per_ticket pt on pt.agent_id = u.id
    left join per_csat pc on pc.agent_id = u.id
    where u.tenant_id = ${tenantId} and u.status != 'disabled'
      and (pt.agent_id is not null or pc.agent_id is not null)
    order by resolved desc, u.name
  `)) as unknown as Row[];

  // "Volume by hour and day" heatmap — Postgres dow (0 = Sunday) × hours 7–18.
  const heatRows = (await db.execute(sql`
    select extract(dow from created_at) as dow, extract(hour from created_at) as hour, count(*) as n
    from app.tickets
    where tenant_id = ${tenantId} and created_at >= now() - make_interval(days => ${days})${teamFilter}
    group by 1, 2
  `)) as unknown as Row[];
  // Rows Monday→Sunday, columns hour 7 → hour 18 (12 cells).
  const HOURS = Array.from({ length: 12 }, (_, i) => 7 + i);
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const heatmap = DOW_ORDER.map((dow) =>
    HOURS.map((hour) => {
      const hit = heatRows.find((r) => n(r.dow) === dow && n(r.hour) === hour);
      return hit ? n(hit.n) : 0;
    }),
  );

  const oldest = (await db.execute(sql`
    select min(created_at) as oldest from app.tickets where tenant_id = ${tenantId}
  `)) as unknown as Row[];
  const oldestAt = oldest[0]?.oldest ? new Date(String(oldest[0].oldest)) : null;
  const dataSpanDays = oldestAt
    ? Math.floor((Date.now() - oldestAt.getTime()) / 86_400_000)
    : 0;

  return {
    current,
    previous,
    csatCurrent: csatNow.pct,
    csatPrevious: csatBefore.pct,
    csatBreakdown: { total: csatNow.total, good: csatNow.good, bad: csatNow.bad },
    daily: daily.map((r) => ({
      day: String(r.day),
      created: n(r.created),
      resolved: n(r.resolved),
    })),
    channels: channels.map((r) => ({ channel: String(r.channel), count: n(r.count) })),
    agents: agents.map((r) => ({
      name: String(r.name),
      resolved: n(r.resolved),
      medianFirstReplySec: r.median_first_reply_sec === null ? null : n(r.median_first_reply_sec),
      medianResolveSec: r.median_resolve_sec === null ? null : n(r.median_resolve_sec),
      csatPct: n(r.csat_total) > 0 ? Math.round((n(r.csat_good) / n(r.csat_total)) * 100) : null,
    })),
    heatmap,
    heatmapHours: HOURS,
    dataSpanDays,
  };
}
