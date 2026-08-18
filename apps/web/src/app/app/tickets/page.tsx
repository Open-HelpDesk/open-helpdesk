import Link from "next/link";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db, mailboxes, tickets, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import {
  DEFAULT_VIEWS,
  INBOX_PAGE_SIZE,
  listTeamViews,
  listTickets,
  viewCounts,
  type InboxFilters,
  type ViewKey,
} from "@/lib/data";
import { PRIORITY_KEYS, STATUS_KEYS, slaShort } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { InboxTable, type InboxRowData } from "./inbox-table";

/**
 * AG-03 — Inbox (design espace-agent) : panneau vues 240 px avec pastilles et compteurs,
 * barre de filtres (chips fonctionnels via searchParams), table dense au grid exact,
 * sélection multiple + navigation clavier (client), pagination, pied raccourcis.
 */

type SearchParams = {
  view?: string;
  tv?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  sort?: string;
  page?: string;
};

function buildQuery(params: SearchParams, patch: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = { ...params, ...patch };
  if (!("page" in patch)) delete merged.page; // tout changement de filtre revient page 1
  const q = Object.entries(merged)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return `/app/tickets${q ? `?${q}` : ""}`;
}

/** Libellé de groupe du panneau vues — 11px/600 uppercase letter-spacing .06em. */
const VIEW_GROUP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

/** Touches du pied de l'inbox — mono, padding 0 4px, radius 3, sans fond. */
const FOOT_KEY: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  padding: "0 4px",
  border: "1px solid var(--line)",
  borderRadius: 3,
};

/** Boutons de pagination — padding 4px 9px, radius 5, bordés. */
const PAGER: React.CSSProperties = {
  padding: "4px 9px",
  border: "1px solid var(--line)",
  borderRadius: 5,
};

/** Chip de la barre de filtres — h28, padding 0 9px, 12px, fond panel. */
const CHIP: React.CSSProperties = {
  height: 28,
  padding: "0 9px",
  border: "1px solid var(--line)",
  borderRadius: 6,
  gap: 5,
  fontSize: 12,
  color: "var(--ink-2)",
  background: "var(--panel)",
};

function FilterChip({
  label,
  value,
  options,
  params,
  paramKey,
  t,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  params: SearchParams;
  paramKey: "status" | "priority" | "assignee";
  t: Translate;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
        style={{
          ...CHIP,
          borderColor: current ? "var(--acc-b)" : "var(--line)",
          background: current ? "var(--acc-t)" : "var(--panel)",
          color: current ? "var(--acc)" : "var(--ink-2)",
        }}
      >
        {current
          ? t("app.tickets.filterChipValue", { label, value: current.label })
          : label}
        <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
      </summary>
      <div
        className="absolute left-0 top-full z-30 mt-1 flex min-w-40 flex-col rounded-md border py-1 shadow-md"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <Link
          href={buildQuery(params, { [paramKey]: undefined })}
          className="px-3 py-1.5 text-[12.5px]"
          style={{ color: "var(--ink-2)" }}
        >
          {t("app.tickets.filterAll")}
        </Link>
        {options.map((o) => (
          <Link
            key={o.value}
            href={buildQuery(params, { [paramKey]: o.value })}
            className="px-3 py-1.5 text-[12.5px]"
            style={{
              color: o.value === value ? "var(--acc)" : "var(--ink)",
              fontWeight: o.value === value ? 600 : 400,
            }}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const params = await searchParams;

  const teamViewId = params.tv;
  const view: ViewKey = (DEFAULT_VIEWS.find((v) => v.key === params.view)?.key ??
    "mine") as ViewKey;
  const filters: InboxFilters = {
    status: params.status,
    priority: params.priority,
    assignee: params.assignee,
    sort: params.sort === "recent" ? "recent" : "priority",
    page: Math.max(1, Number(params.page) || 1),
  };

  const [counts, teamViews, agents] = await Promise.all([
    viewCounts(tenant.id, agent.id),
    listTeamViews(tenant.id),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
  ]);

  let rows: Awaited<ReturnType<typeof listTickets>>["rows"] = [];
  let total = 0;
  let loadError = false;
  try {
    const result = await listTickets(
      tenant.id,
      teamViewId ? { teamViewId } : view,
      agent.id,
      filters,
    );
    rows = result.rows;
    total = result.total;
  } catch {
    loadError = true;
  }

  // Premier lancement : aucun ticket dans le workspace.
  let firstLaunch = false;
  let mailboxAddress = "";
  if (!loadError && total === 0 && !params.status && !params.priority && !params.assignee) {
    const [row] = await db
      .select({ n: count() })
      .from(tickets)
      .where(eq(tickets.tenantId, tenant.id));
    if ((row?.n ?? 0) === 0) {
      firstLaunch = true;
      const [mailbox] = await db
        .select({ address: mailboxes.address })
        .from(mailboxes)
        .where(eq(mailboxes.tenantId, tenant.id));
      mailboxAddress = mailbox?.address ?? `support@${tenant.slug}.open-helpdesk.email`;
    }
  }

  const now = Date.now();
  const tableRows: InboxRowData[] = rows.map((row) => {
    const due =
      !row.firstRepliedAt && row.firstReplyDueAt ? row.firstReplyDueAt : row.resolveDueAt;
    const remaining = due ? due.getTime() - now : null;
    const overdue = remaining !== null && remaining < 0;
    const openStatus = ["new", "open", "waiting", "on_hold"].includes(row.status);
    return {
      id: row.id,
      number: row.number,
      subject: row.subject,
      excerpt: row.excerpt,
      isNew: row.status === "new",
      priority: row.priority,
      contactName: row.requesterName ?? row.requesterEmail,
      orgName: row.organizationName,
      status: row.status,
      sla:
        remaining === null || !openStatus
          ? null
          : {
              text: slaShort(t, remaining),
              tone: overdue ? "dang" : remaining < 30 * 60_000 ? "wait" : "neutral",
            },
      overdue: overdue && openStatus,
      assigneeName: row.assigneeName,
      activity: t.fmt.relative(row.updatedAt),
      href: `/app/tickets/${row.number}?view=${view}`,
    };
  });

  const page = filters.page ?? 1;
  const from = total === 0 ? 0 : (page - 1) * INBOX_PAGE_SIZE + 1;
  const to = Math.min(page * INBOX_PAGE_SIZE, total);

  const statusOptions = Object.entries(STATUS_KEYS).map(([value, key]) => ({
    value,
    label: t(key),
  }));
  const priorityOptions = Object.entries(PRIORITY_KEYS).map(([value, key]) => ({
    value,
    label: t(key),
  }));
  const [firstLaunchBefore, firstLaunchAfter] = t.parts(
    "app.tickets.firstLaunchBody",
    "address",
  );
  const assigneeOptions = [
    { value: "none", label: t("app.tickets.unassigned") },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className="flex h-full">
      {/* Panneau des vues — 240 px */}
      <nav
        className="flex shrink-0 flex-col overflow-auto border-r"
        style={{ width: 240, background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <div style={{ ...VIEW_GROUP, padding: "14px 14px 8px" }}>
          {t("app.tickets.viewsGroup")}
        </div>
        {DEFAULT_VIEWS.map((v) => {
          const active = !teamViewId && v.key === view;
          return (
            <Link
              key={v.key}
              href={`/app/tickets?view=${v.key}`}
              className="flex items-center"
              style={{
                gap: 9,
                margin: "0 8px 1px",
                padding: "7px 9px",
                borderRadius: 6,
                fontSize: 13,
                background: active ? "var(--acc-t)" : "transparent",
                color: active ? "var(--acc)" : "var(--ink-2)",
                fontWeight: active ? 600 : 450,
              }}
            >
              <span
                className="shrink-0 rounded-full"
                style={{ width: 6, height: 6, background: `var(--${v.dot})` }}
              />
              <span className="min-w-0 flex-1 truncate">{t(v.labelKey)}</span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: active ? "var(--acc)" : "var(--ink-3)",
                }}
              >
                {counts[v.key]}
              </span>
            </Link>
          );
        })}

        {teamViews.length > 0 && (
          <>
            <div style={{ height: 1, background: "var(--line)", margin: "10px 14px" }} />
            <div style={{ ...VIEW_GROUP, padding: "2px 14px 8px" }}>
              {t("app.tickets.teamViewsGroup")}
            </div>
            {teamViews.map((v) => {
              const active = v.id === teamViewId;
              return (
                <Link
                  key={v.id}
                  href={`/app/tickets?tv=${v.id}`}
                  className="flex items-center"
                  style={{
                    gap: 9,
                    margin: "0 8px 1px",
                    padding: "7px 9px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: active ? "var(--acc-t)" : "transparent",
                    color: active ? "var(--acc)" : "var(--ink-2)",
                    fontWeight: active ? 600 : 450,
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: 11, color: active ? "var(--acc)" : "var(--ink-3)" }}
                  >
                    {v.count}
                  </span>
                </Link>
              );
            })}
          </>
        )}

        <span className="flex-1" />
        <button
          type="button"
          style={{
            margin: 8,
            padding: "8px 9px",
            border: "1px dashed var(--line)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--ink-2)",
            textAlign: "center",
          }}
        >
          {t("app.tickets.newView")}
        </button>
      </nav>

      {/* Colonne table */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barre de filtres */}
        <div
          className="flex shrink-0 flex-wrap items-center border-b"
          style={{ gap: 6, padding: "9px 14px", borderColor: "var(--line)" }}
        >
          <FilterChip
            label={t("app.tickets.status")}
            value={params.status}
            options={statusOptions}
            params={params}
            paramKey="status"
            t={t}
          />
          <FilterChip
            label={t("app.tickets.priority")}
            value={params.priority}
            options={priorityOptions}
            params={params}
            paramKey="priority"
            t={t}
          />
          <FilterChip
            label={t("app.tickets.assignee")}
            value={params.assignee}
            options={assigneeOptions}
            params={params}
            paramKey="assignee"
            t={t}
          />
          <button type="button" className="flex items-center" style={CHIP}>
            {t("app.tickets.team")} <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
          </button>
          <button type="button" className="flex items-center" style={CHIP}>
            {t("app.tickets.tags")} <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
          </button>

          <span className="flex-1" />
          <span
            className="whitespace-nowrap tabular-nums"
            style={{ fontSize: 12, color: "var(--ink-3)" }}
          >
            {t("app.tickets.count", { count: total })}
          </span>
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
              style={CHIP}
            >
              {t("app.tickets.sortBy", {
                value:
                  filters.sort === "recent"
                    ? t("app.tickets.activity")
                    : t("app.tickets.priority"),
              })}
              <span style={{ opacity: 0.5, fontSize: 9 }}>▾</span>
            </summary>
            <div
              className="absolute right-0 top-full z-30 mt-1 flex min-w-36 flex-col rounded-md border py-1 shadow-md"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <Link
                href={buildQuery(params, { sort: undefined })}
                className="px-3 py-1.5 text-[12.5px]"
              >
                {t("app.tickets.priority")}
              </Link>
              <Link
                href={buildQuery(params, { sort: "recent" })}
                className="px-3 py-1.5 text-[12.5px]"
              >
                {t("app.tickets.sortRecentActivity")}
              </Link>
            </div>
          </details>
        </div>

        {/* Table */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-auto"
          style={{ background: "var(--bg)" }}
        >
          {loadError ? (
            <div className="grid flex-1 place-items-center">
              <div
                className="flex flex-col items-center text-center"
                style={{ gap: 12, maxWidth: 320 }}
              >
                <span
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 44,
                    height: 44,
                    background: "var(--dang-t)",
                    color: "var(--dang)",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4.5M12 16h.01" />
                  </svg>
                </span>
                <p style={{ fontSize: 15, fontWeight: 600 }}>
                  {t("app.tickets.loadErrorTitle")}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {t("app.tickets.loadErrorBody")}
                </p>
                <Link
                  href={buildQuery(params, {})}
                  className="grid place-items-center font-semibold text-white"
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 6,
                    background: "var(--acc)",
                    fontSize: 13,
                  }}
                >
                  {t("app.tickets.retry")}
                </Link>
              </div>
            </div>
          ) : firstLaunch ? (
            <div className="grid flex-1 place-items-center" style={{ padding: 24 }}>
              <div
                className="flex flex-col items-center text-center"
                style={{
                  gap: 12,
                  maxWidth: 380,
                  padding: 32,
                  border: "1px solid var(--acc-b)",
                  background: "var(--acc-t)",
                  borderRadius: 12,
                }}
              >
                <p style={{ fontSize: 16, fontWeight: 600 }}>
                  {t("app.tickets.firstLaunchTitle")}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-2)", textWrap: "pretty" }}>
                  {firstLaunchBefore}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      background: "var(--panel)",
                      padding: "1px 5px",
                      borderRadius: 4,
                      border: "1px solid var(--acc-b)",
                    }}
                  >
                    {mailboxAddress}
                  </span>
                  {firstLaunchAfter}
                </p>
                <Link
                  href="/onboarding?step=2"
                  className="grid place-items-center font-semibold text-white"
                  style={{
                    height: 34,
                    padding: "0 16px",
                    borderRadius: 6,
                    background: "var(--acc)",
                    fontSize: 13,
                  }}
                >
                  {t("app.tickets.configureEmail")}
                </Link>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="grid flex-1 place-items-center">
              <div
                className="flex flex-col items-center text-center"
                style={{ gap: 10, maxWidth: 320 }}
              >
                <svg
                  viewBox="0 0 64 64"
                  width="72"
                  height="72"
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="8" y="16" width="48" height="34" rx="4" />
                  <path d="M8 22l24 15 24-15" stroke="var(--acc-b)" />
                </svg>
                <p style={{ fontSize: 15, fontWeight: 600 }}>
                  {t("app.tickets.emptyTitle")}
                </p>
                <p style={{ fontSize: 13, color: "var(--ink-2)", textWrap: "pretty" }}>
                  {t("app.tickets.emptyBody")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <InboxTable rows={tableRows} agents={agents} />
              {/* Pagination */}
              <div
                className="flex items-center justify-between"
                style={{ padding: "12px 14px", fontSize: 12, color: "var(--ink-3)" }}
              >
                <span className="tabular-nums">
                  {t("app.tickets.pageRange", { from, to, total })}
                </span>
                <div className="flex" style={{ gap: 4 }}>
                  {page > 1 ? (
                    <Link href={buildQuery(params, { page: String(page - 1) })} style={PAGER}>
                      {t("app.tickets.previous")}
                    </Link>
                  ) : (
                    <span style={{ ...PAGER, borderColor: "var(--line-2)", opacity: 0.55 }}>
                      {t("app.tickets.previous")}
                    </span>
                  )}
                  {to < total ? (
                    <Link
                      href={buildQuery(params, { page: String(page + 1) })}
                      style={{ ...PAGER, background: "var(--panel)" }}
                    >
                      {t("app.tickets.next")}
                    </Link>
                  ) : (
                    <span style={{ ...PAGER, borderColor: "var(--line-2)", opacity: 0.55 }}>
                      {t("app.tickets.next")}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pied raccourcis */}
        <div
          className="flex shrink-0 items-center border-t"
          style={{
            gap: 14,
            padding: "6px 14px",
            background: "var(--panel)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
            fontSize: 11,
          }}
        >
          <span>
            <kbd style={FOOT_KEY}>j</kbd> <kbd style={FOOT_KEY}>k</kbd>{" "}
            {t("app.tickets.shortcutNavigate")}
          </span>
          <span>
            <kbd style={FOOT_KEY}>↵</kbd> {t("app.tickets.shortcutOpen")}
          </span>
          <span>
            <kbd style={FOOT_KEY}>x</kbd> {t("app.tickets.shortcutSelect")}
          </span>
          <span className="flex-1" />
          <span className="flex items-center" style={{ gap: 5 }}>
            <span
              className="rounded-full"
              style={{ width: 6, height: 6, background: "var(--ok)" }}
            />
            {t("app.tickets.realtimeActive")}
          </span>
        </div>
      </section>
    </div>
  );
}
