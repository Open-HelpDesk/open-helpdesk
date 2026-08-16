/** Requêtes de AG-09 — Rapports. Fenêtre courante + fenêtre précédente pour les deltas. */
import { db } from "@openhelpdesk/db";
import { sql } from "drizzle-orm";

export type ReportData = Awaited<ReturnType<typeof getReportData>>;

type Row = Record<string, unknown>;
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function getReportData(tenantId: string, days: number) {
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
      where tenant_id = ${tenantId} and deleted_at is null and merged_into_id is null
    `)) as unknown as Row[];
    const r = rows[0] ?? {};
    const resolved = n(r.resolved);
    return {
      created: n(r.created),
      resolved,
      medianFirstReplySec: r.median_first_reply_sec === null ? null : n(r.median_first_reply_sec),
      medianResolveSec: r.median_resolve_sec === null ? null : n(r.median_resolve_sec),
      slaCompliancePct: resolved > 0 ? Math.round((n(r.sla_ok) / resolved) * 100) : null,
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
    return total > 0 ? Math.round((n(rows[0]?.good) / total) * 100) : null;
  }

  const [current, previous, csatCurrent, csatPrevious] = await Promise.all([
    metrics(0),
    metrics(1),
    csat(0),
    csat(1),
  ]);

  const daily = (await db.execute(sql`
    select d::date as day,
      (select count(*) from app.tickets t where t.tenant_id = ${tenantId}
        and t.created_at >= d and t.created_at < d + interval '1 day') as created,
      (select count(*) from app.tickets t where t.tenant_id = ${tenantId}
        and t.resolved_at >= d and t.resolved_at < d + interval '1 day') as resolved
    from generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}),
                         date_trunc('day', now()), interval '1 day') as d
    order by d
  `)) as unknown as Row[];

  const channels = (await db.execute(sql`
    select channel, count(*) as count from app.tickets
    where tenant_id = ${tenantId} and created_at >= now() - make_interval(days => ${days})
    group by channel order by count desc
  `)) as unknown as Row[];

  const agents = (await db.execute(sql`
    select u.name,
      count(t.id) filter (where t.resolved_at >= now() - make_interval(days => ${days})) as resolved,
      percentile_cont(0.5) within group (order by extract(epoch from (t.first_replied_at - t.created_at)))
        filter (where t.first_replied_at >= now() - make_interval(days => ${days})) as median_first_reply_sec,
      count(c.id) filter (where c.score = 'good') as csat_good,
      count(c.id) as csat_total
    from app.users u
    left join app.tickets t on t.assignee_id = u.id and t.tenant_id = ${tenantId}
    left join app.csat_responses c on c.agent_id = u.id and c.tenant_id = ${tenantId}
      and c.created_at >= now() - make_interval(days => ${days})
    where u.tenant_id = ${tenantId} and u.status != 'disabled'
    group by u.id, u.name
    having count(t.id) > 0 or count(c.id) > 0
    order by resolved desc
  `)) as unknown as Row[];

  const tags = (await db.execute(sql`
    select tag, count(*) as count
    from app.tickets, unnest(tags) as tag
    where tenant_id = ${tenantId} and created_at >= now() - make_interval(days => ${days})
    group by tag order by count desc limit 8
  `)) as unknown as Row[];

  return {
    current,
    previous,
    csatCurrent,
    csatPrevious,
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
      csatPct: n(r.csat_total) > 0 ? Math.round((n(r.csat_good) / n(r.csat_total)) * 100) : null,
    })),
    tags: tags.map((r) => ({ tag: String(r.tag), count: n(r.count) })),
  };
}
