import { providedMailboxAddress } from "@openhelpdesk/config";
import type { CSSProperties } from "react";
import Link from "next/link";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { db, mailboxes, tickets, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import {
  DEFAULT_VIEWS,
  INBOX_PAGE_SIZE,
  INBOX_SORTS,
  inboxFacets,
  canDeleteView,
  listSavedViews,
  listTickets,
  viewCounts,
  type InboxFilters,
  type InboxSort,
  type ViewKey,
} from "@/lib/data";
import { slaShort } from "@/lib/format";
import { getT, type Translate } from "@/i18n/server";
import { InboxTable, type InboxRowData } from "./inbox-table";
import { InboxControls } from "./inbox-controls";
import { deleteView } from "./views/new/actions";

/**
 * AG-03 — Inbox (agent space design): 240 px views panel with dots and counters,
 * filter bar (working chips through searchParams), dense table on the exact grid,
 * multi-selection + keyboard navigation (client), pagination, shortcuts footer.
 */

type SearchParams = {
  view?: string;
  tv?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  /** V2 multi-select groups — repeated params, hence string | string[]. */
  prio?: string | string[];
  chan?: string | string[];
  org?: string | string[];
  sort?: string;
  page?: string;
};

/** A repeated query parameter reaches us as a string or as an array. */
function many(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * Rebuilds the inbox URL with `patch` applied.
 *
 * Goes through URLSearchParams because the V2 filter groups repeat their key
 * (`prio=urgent&prio=high`): flattening those into an object would have kept one
 * value per group, so paging through a filtered inbox would quietly widen it.
 */
function buildQuery(params: SearchParams, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key in patch) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) q.append(key, v);
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) q.set(key, value);
  }
  if (!("page" in patch)) q.delete("page"); // any filter change goes back to page 1
  const query = q.toString();
  return `/app/tickets${query ? `?${query}` : ""}`;
}

/** The query string minus what the V2 menus own, for their own links. */
function baseQueryFor(params: SearchParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (["prio", "chan", "org", "sort", "page"].includes(key)) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) q.append(key, v);
    }
  }
  return q.toString();
}

/** Group label of the views panel — 11px/600 uppercase letter-spacing .06em. */
const VIEW_GROUP: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
};

/** Keys of the inbox footer — mono, padding 0 4px, radius 3, no background. */
const FOOT_KEY: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  padding: "0 4px",
  border: "1px solid var(--line)",
  borderRadius: 3,
};

/** Pagination buttons — padding 4px 9px, radius 5, bordered. */
const PAGER: React.CSSProperties = {
  padding: "4px 9px",
  border: "1px solid var(--line)",
  borderRadius: 5,
};


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
  const selection = {
    priorities: many(params.prio),
    channels: many(params.chan),
    orgs: many(params.org),
  };
  const urlSort: InboxSort | null = (INBOX_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as InboxSort)
    : null;

  const [counts, savedViews, agents] = await Promise.all([
    viewCounts(tenant.id, agent.id),
    listSavedViews(tenant.id, agent.id),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
  ]);

  // A saved view carries its own default sort (newview). The URL still wins:
  // clicking a sort has to hold, and a shared link has to show what it showed.
  // "SLA" is the V2 default, and the design shows it selected.
  const selectedView = teamViewId ? savedViews.find((v) => v.id === teamViewId) : undefined;
  const sort: InboxSort = urlSort ?? selectedView?.sort ?? "sla";
  const filters: InboxFilters = {
    status: params.status,
    priority: params.priority,
    assignee: params.assignee,
    ...selection,
    sort,
    page: Math.max(1, Number(params.page) || 1),
  };

  const facets = await inboxFacets(
    tenant.id,
    teamViewId ? { teamViewId } : view,
    agent.id,
    filters,
  );

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

  // First launch: no ticket in the workspace.
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
      mailboxAddress = mailbox?.address ?? providedMailboxAddress(tenant.slug);
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

  const [firstLaunchBefore, firstLaunchAfter] = t.parts(
    "app.tickets.firstLaunchBody",
    "address",
  );

  return (
    <div className="flex h-full">
      {/* Views panel — 232 px (V2) */}
      <nav
        className="flex shrink-0 flex-col overflow-auto border-r"
        style={{
          width: 232,
          padding: "16px 10px",
          gap: 2,
          background: "var(--panel)",
          borderColor: "var(--line)",
        }}
      >
        <div style={{ ...VIEW_GROUP, padding: "0 10px 8px" }}>
          {t("app.tickets.viewsGroup")}
        </div>
        {DEFAULT_VIEWS.map((v) => {
          const active = !teamViewId && v.key === view;
          return (
            <Link
              key={v.key}
              href={`/app/tickets?view=${v.key}`}
              className="ohd-row flex items-center"
              style={{
                gap: 9,
                padding: "8px 10px",
                borderRadius: 9,
                fontSize: 13.5,
                "--row-bg": active ? "var(--brand-t)" : "transparent",
                color: active ? "var(--brand)" : "var(--ink-2)",
                fontWeight: active ? 600 : 450,
              } as CSSProperties}
            >
              {/* No status dot: V2 drops it. The view's name says what it holds,
                  and six coloured dots down the panel competed with the pills in
                  the list, which are the ones that carry status. */}
              <span className="min-w-0 flex-1 truncate">{t(v.labelKey)}</span>
              <span
                className="tabular-nums"
                style={{ fontSize: 11.5, color: "var(--ink-3)" }}
              >
                {counts[v.key]}
              </span>
            </Link>
          );
        })}

        {savedViews.length > 0 && (
          <>
            <div style={{ height: 1, background: "var(--line)", margin: "10px 14px" }} />
            <div style={{ ...VIEW_GROUP, padding: "2px 14px 8px" }}>
              {t("app.tickets.teamViewsGroup")}
            </div>
            {savedViews.map((v) => {
              const active = v.id === teamViewId;
              return (
                <Link
                  key={v.id}
                  href={`/app/tickets?tv=${v.id}`}
                  className="ohd-row flex items-center"
                  style={{
                    gap: 9,
                    padding: "8px 10px",
                    borderRadius: 9,
                    fontSize: 13.5,
                    "--row-bg": active ? "var(--brand-t)" : "transparent",
                    color: active ? "var(--brand)" : "var(--ink-2)",
                    fontWeight: active ? 600 : 450,
                  } as CSSProperties}
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
        <Link
          href="/app/tickets/views/new"
          className="ohd-hover-edge-ink"
          style={{
            marginTop: 8,
            padding: "8px 10px",
            border: "1.5px dashed var(--line)",
            borderRadius: 9,
            fontSize: 12.5,
            color: "var(--ink-3)",
            textAlign: "center",
          }}
        >
          {t("app.tickets.newView")}
        </Link>
      </nav>

      {/* Table column */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* V2 header: the view's name in the title face, its count as a pill,
            and the two menus. It replaces a row of single-value chips — see
            inbox-controls.tsx for why the chips went. */}
        <div className="flex flex-none items-center" style={{ gap: 12, padding: "14px 20px" }}>
          <h1
            style={{
              fontFamily: "var(--font-title)",
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-.015em",
            }}
          >
            {teamViewId
              ? (selectedView?.name ?? t("app.tickets.viewsGroup"))
              : t(DEFAULT_VIEWS.find((v) => v.key === view)!.labelKey)}
          </h1>
          <span
            className="tabular-nums"
            style={{
              padding: "2px 9px",
              borderRadius: 999,
              background: "var(--brand-t)",
              color: "var(--brand)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {total}
          </span>
          <span className="flex-1" />
          {/* Deleting a saved view lives here rather than on its rail row: a form
              cannot nest inside the row's link, and a view one can create but
              never remove is a one-way door. */}
          {selectedView && canDeleteView(selectedView, agent) && (
            <form action={deleteView}>
              <input type="hidden" name="viewId" value={selectedView.id} />
              <button
                type="submit"
                className="ohd-hover-edge-ink"
                style={{
                  height: 34,
                  padding: "0 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 9,
                  background: "var(--panel)",
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                }}
              >
                {t("app.tickets.delete")}
              </button>
            </form>
          )}
          <InboxControls
            sort={sort}
            facets={facets}
            selection={selection}
            baseQuery={baseQueryFor(params)}
          />
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
                  className="grid place-items-center font-semibold"
                  style={{
                    color: "var(--on-brand)",
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
            /* Empty inbox on a new workspace. This used to read "Connect your
               mailbox" with a button back into onboarding step 2 — wrong as soon
               as that step was done, since the receiving address is live from
               the start: the inbox is connected, just empty. It now says so and
               sends the owner to the settings for the rest of the setup. */
            <div className="grid flex-1 place-items-center" style={{ padding: 24 }}>
              <div
                className="flex flex-col items-center text-center"
                style={{
                  gap: 14,
                  maxWidth: 420,
                  padding: "32px 28px",
                  border: "1px solid var(--line)",
                  background: "var(--panel)",
                  borderRadius: 14,
                  boxShadow: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.10)",
                }}
              >
                <span
                  className="grid place-items-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "var(--acc-t)",
                    border: "1px solid var(--acc-b)",
                  }}
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--acc)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 7.5 12 13l8.5-5.5" />
                  </svg>
                </span>

                <div className="flex flex-col" style={{ gap: 6 }}>
                  <p style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.01em" }}>
                    {t("app.tickets.firstLaunchTitle")}
                  </p>
                  <p style={{ fontSize: 13.5, color: "var(--ink-2)", textWrap: "pretty" }}>
                    {firstLaunchBefore}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12.5,
                        background: "var(--sunk)",
                        padding: "2px 6px",
                        borderRadius: 5,
                        border: "1px solid var(--line-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {mailboxAddress}
                    </span>
                    {firstLaunchAfter}
                  </p>
                </div>

                <div
                  className="flex flex-col items-center"
                  style={{
                    gap: 10,
                    width: "100%",
                    paddingTop: 14,
                    borderTop: "1px solid var(--line-2)",
                  }}
                >
                  <p style={{ fontSize: 12.5, color: "var(--ink-3)", textWrap: "pretty" }}>
                    {t("app.tickets.firstLaunchHint")}
                  </p>
                  <Link
                    href="/app/settings/general"
                    className="ohd-hover-acc grid place-items-center font-semibold"
                    style={{
                      color: "var(--on-brand)",
                      height: 36,
                      padding: "0 18px",
                      borderRadius: 8,
                      background: "var(--acc)",
                      fontSize: 13,
                    }}
                  >
                    {t("app.tickets.configureEmail")}
                  </Link>
                </div>
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

        {/* Shortcuts footer */}
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
