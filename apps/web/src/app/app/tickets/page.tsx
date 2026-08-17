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
import {
  PRIORITY_LABELS_FR,
  STATUS_LABELS_FR,
  relativeFr,
  slaShortFr,
} from "@/lib/format";
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

function FilterChip({
  label,
  value,
  options,
  params,
  paramKey,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  params: SearchParams;
  paramKey: "status" | "priority" | "assignee";
}) {
  const current = options.find((o) => o.value === value);
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1 rounded-md border px-2.5 text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
        style={{
          height: 28,
          borderColor: current ? "var(--acc-b)" : "var(--line)",
          background: current ? "var(--acc-t)" : "var(--bg)",
          color: current ? "var(--acc)" : "var(--ink-2)",
        }}
      >
        {label}
        {current ? ` : ${current.label}` : ""} <span style={{ fontSize: 9 }}>▾</span>
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
          Tous
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
  const tableRows: InboxRowData[] = rows.map((t) => {
    const due =
      !t.firstRepliedAt && t.firstReplyDueAt ? t.firstReplyDueAt : t.resolveDueAt;
    const remaining = due ? due.getTime() - now : null;
    const overdue = remaining !== null && remaining < 0;
    const openStatus = ["new", "open", "waiting", "on_hold"].includes(t.status);
    return {
      id: t.id,
      number: t.number,
      subject: t.subject,
      excerpt: t.excerpt,
      isNew: t.status === "new",
      priority: t.priority,
      contactName: t.requesterName ?? t.requesterEmail,
      orgName: t.organizationName,
      status: t.status,
      sla:
        remaining === null || !openStatus
          ? null
          : {
              text: slaShortFr(remaining),
              tone: overdue ? "dang" : remaining < 30 * 60_000 ? "wait" : "neutral",
            },
      overdue: overdue && openStatus,
      assigneeName: t.assigneeName,
      activity: relativeFr(t.updatedAt),
      href: `/app/tickets/${t.number}?view=${view}`,
    };
  });

  const page = filters.page ?? 1;
  const from = total === 0 ? 0 : (page - 1) * INBOX_PAGE_SIZE + 1;
  const to = Math.min(page * INBOX_PAGE_SIZE, total);

  const statusOptions = Object.entries(STATUS_LABELS_FR).map(([value, label]) => ({
    value,
    label,
  }));
  const priorityOptions = Object.entries(PRIORITY_LABELS_FR).map(([value, label]) => ({
    value,
    label,
  }));
  const assigneeOptions = [
    { value: "none", label: "Non assigné" },
    ...agents.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div className="flex h-full">
      {/* Panneau des vues — 240 px */}
      <nav
        className="flex w-60 shrink-0 flex-col overflow-y-auto border-r p-3"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <p
          className="mb-2 px-2 font-semibold uppercase tracking-wider"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          Vues
        </p>
        <ul className="flex flex-col gap-0.5">
          {DEFAULT_VIEWS.map((v) => {
            const active = !teamViewId && v.key === view;
            return (
              <li key={v.key}>
                <Link
                  href={`/app/tickets?view=${v.key}`}
                  className="flex items-center gap-2 rounded-md text-[13px]"
                  style={{
                    padding: "7px 9px",
                    borderRadius: 6,
                    background: active ? "var(--acc-t)" : "transparent",
                    color: active ? "var(--acc)" : "var(--ink)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: `var(--${v.dot})` }}
                  />
                  <span className="min-w-0 flex-1 truncate">{v.label}</span>
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
              </li>
            );
          })}
        </ul>

        {teamViews.length > 0 && (
          <>
            <p
              className="mb-2 mt-4 px-2 font-semibold uppercase tracking-wider"
              style={{ fontSize: 11, color: "var(--ink-3)" }}
            >
              Vues d'équipe
            </p>
            <ul className="flex flex-col gap-0.5">
              {teamViews.map((v) => {
                const active = v.id === teamViewId;
                return (
                  <li key={v.id}>
                    <Link
                      href={`/app/tickets?tv=${v.id}`}
                      className="flex items-center gap-2 rounded-md text-[13px]"
                      style={{
                        padding: "7px 9px",
                        borderRadius: 6,
                        background: active ? "var(--acc-t)" : "transparent",
                        color: active ? "var(--acc)" : "var(--ink)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{v.name}</span>
                      <span
                        className="tabular-nums"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: active ? "var(--acc)" : "var(--ink-3)",
                        }}
                      >
                        {v.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <button
          className="mt-3 w-full rounded-md border border-dashed px-2 py-1.5 text-left text-[13px]"
          style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
        >
          + Nouvelle vue
        </button>
      </nav>

      {/* Colonne table */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barre de filtres */}
        <div
          className="flex shrink-0 items-center gap-2 border-b"
          style={{
            padding: "9px 14px",
            background: "var(--panel)",
            borderColor: "var(--line)",
          }}
        >
          <FilterChip
            label="Statut"
            value={params.status}
            options={statusOptions}
            params={params}
            paramKey="status"
          />
          <FilterChip
            label="Priorité"
            value={params.priority}
            options={priorityOptions}
            params={params}
            paramKey="priority"
          />
          <FilterChip
            label="Assigné"
            value={params.assignee}
            options={assigneeOptions}
            params={params}
            paramKey="assignee"
          />
          <button
            className="flex items-center gap-1 rounded-md border px-2.5 text-[12.5px] font-medium"
            style={{ height: 28, borderColor: "var(--line)", color: "var(--ink-2)" }}
          >
            Équipe <span style={{ fontSize: 9 }}>▾</span>
          </button>
          <button
            className="flex items-center gap-1 rounded-md border px-2.5 text-[12.5px] font-medium"
            style={{ height: 28, borderColor: "var(--line)", color: "var(--ink-2)" }}
          >
            Tags <span style={{ fontSize: 9 }}>▾</span>
          </button>

          <span className="flex-1" />
          <span className="whitespace-nowrap text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {total} ticket{total > 1 ? "s" : ""}
          </span>
          <details className="relative">
            <summary
              className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 text-[12.5px] font-medium [&::-webkit-details-marker]:hidden"
              style={{ height: 28, color: "var(--ink-2)" }}
            >
              Trier : {filters.sort === "recent" ? "Activité" : "Priorité"}{" "}
              <span style={{ fontSize: 9 }}>▾</span>
            </summary>
            <div
              className="absolute right-0 top-full z-30 mt-1 flex min-w-36 flex-col rounded-md border py-1 shadow-md"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <Link
                href={buildQuery(params, { sort: undefined })}
                className="px-3 py-1.5 text-[12.5px]"
              >
                Priorité
              </Link>
              <Link
                href={buildQuery(params, { sort: "recent" })}
                className="px-3 py-1.5 text-[12.5px]"
              >
                Activité récente
              </Link>
            </div>
          </details>
        </div>

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
          {loadError ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <p className="text-sm font-semibold">Impossible de charger cette vue</p>
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                La connexion au serveur a échoué.
              </p>
              <Link
                href={buildQuery(params, {})}
                className="mt-2 rounded-md border px-3 py-1.5 text-[13px] font-medium"
                style={{ borderColor: "var(--line)" }}
              >
                Réessayer
              </Link>
            </div>
          ) : firstLaunch ? (
            <div className="flex justify-center py-20">
              <div
                className="flex max-w-md flex-col items-center gap-3 rounded-xl border p-8 text-center"
                style={{ background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
              >
                <p className="text-sm font-semibold">Connectez votre boîte email</p>
                <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                  Les emails reçus à cette adresse deviendront automatiquement des tickets :
                </p>
                <code
                  className="rounded-md border px-3 py-1.5 text-[13px]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    background: "var(--bg)",
                    borderColor: "var(--line)",
                  }}
                >
                  {mailboxAddress}
                </code>
                <Link
                  href="/onboarding?step=2"
                  className="mt-1 rounded-md px-4 py-2 text-[13px] font-semibold text-white"
                  style={{ background: "var(--acc)" }}
                >
                  Configurer l'email
                </Link>
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <p className="text-sm font-semibold">Aucun ticket dans cette vue</p>
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                Tout est traité. Les nouveaux emails arriveront ici automatiquement.
              </p>
            </div>
          ) : (
            <>
              <InboxTable rows={tableRows} agents={agents} />
              {/* Pagination */}
              <div
                className="flex items-center justify-between border-t px-4 py-2.5"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="text-[12px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                  {from}–{to} sur {total}
                </span>
                <div className="flex gap-1.5">
                  {page > 1 ? (
                    <Link
                      href={buildQuery(params, { page: String(page - 1) })}
                      className="rounded-md border px-2.5 py-1 text-[12px] font-medium"
                      style={{ borderColor: "var(--line)" }}
                    >
                      Précédent
                    </Link>
                  ) : (
                    <span
                      className="rounded-md border px-2.5 py-1 text-[12px]"
                      style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                    >
                      Précédent
                    </span>
                  )}
                  {to < total ? (
                    <Link
                      href={buildQuery(params, { page: String(page + 1) })}
                      className="rounded-md border px-2.5 py-1 text-[12px] font-medium"
                      style={{ borderColor: "var(--line)" }}
                    >
                      Suivant
                    </Link>
                  ) : (
                    <span
                      className="rounded-md border px-2.5 py-1 text-[12px]"
                      style={{ borderColor: "var(--line-2)", color: "var(--ink-3)" }}
                    >
                      Suivant
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Pied raccourcis */}
        <div
          className="flex shrink-0 items-center gap-3 border-t px-4"
          style={{
            height: 30,
            background: "var(--sunk)",
            borderColor: "var(--line)",
            color: "var(--ink-3)",
            fontSize: 11.5,
          }}
        >
          <span className="flex items-center gap-1.5">
            <kbd className="ohd-kbd">j</kbd>
            <kbd className="ohd-kbd">k</kbd> naviguer · <kbd className="ohd-kbd">↵</kbd>{" "}
            ouvrir · <kbd className="ohd-kbd">x</kbd> sélectionner
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">
            <span
              className="rounded-full"
              style={{ width: 6, height: 6, background: "var(--ok)" }}
            />
            Temps réel actif
          </span>
        </div>
      </section>
    </div>
  );
}
