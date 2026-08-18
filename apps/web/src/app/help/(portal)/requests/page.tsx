import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContact } from "@/lib/portal-auth";
import {
  hasSharedOrganization,
  listContactRequests,
  type PortalRequestRow,
} from "@/lib/portal-data";
import { statusKey } from "../../portal-format";
import { firstName } from "@/i18n/format";
import { getT, type Translate } from "@/i18n/server";

const OPEN_STATUSES = new Set(["new", "open", "waiting", "on_hold"]);

const TABS = [
  ["open", "requests.tabOpen"],
  ["solved", "requests.tabSolved"],
  ["all", "requests.tabAll"],
] as const;

/** Couleurs de badge statut (vocabulaire client, PT-05). */
function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === "waiting") return { background: "var(--wait-t)", color: "var(--wait)" };
  if (status === "resolved") return { background: "var(--ok-t)", color: "var(--ok)" };
  if (status === "closed") return { background: "var(--closed-t)", color: "var(--closed)" };
  return { background: "var(--open-t)", color: "var(--open)" };
}

/** « Réponse de Marie il y a 3 h », « En attente de votre réponse depuis hier »…
 *  La phrase entière est traduite ; seule la partie temporelle est composée, et
 *  elle l'est par Intl, pas à la main. */
function activityLabel(r: PortalRequestRow, t: Translate): string {
  const when = (d: Date) => t.fmt.relative(d);
  if (r.status === "resolved")
    return t("activity.resolved", { when: when(r.resolvedAt ?? r.updatedAt) });
  if (r.status === "closed")
    return t("activity.closed", { when: when(r.closedAt ?? r.updatedAt) });
  if (r.status === "waiting")
    return t("activity.waiting", { since: sinceLabel(r.lastMessage?.createdAt ?? r.updatedAt, t) });
  const last = r.lastMessage;
  if (last?.authorType === "agent" && last.authorName)
    return t("activity.agentReplied", {
      name: firstName(last.authorName),
      when: when(last.createdAt),
    });
  if (last && r.messageCount > 1)
    return t("activity.youReplied", { when: when(last.createdAt) });
  return t("activity.created", { when: when(r.createdAt) });
}

/** « depuis 3 jours » — aucune API Intl ne la produit, elle vit au dictionnaire. */
function sinceLabel(date: Date, t: Translate): string {
  const { unit, n } = t.fmt.elapsed(date);
  if (unit === "minute") return t("since.minutes", { count: n });
  if (unit === "hour") return t("since.hours", { count: n });
  if (unit === "day") return t("since.days", { count: n });
  return t("since.date", { date: t.fmt.dateShort(date) });
}

/** PT-05 — Mes demandes : onglets, lignes réf/sujet/activité/badges, état vide verbatim. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getT();
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const { tab: tabParam } = await searchParams;

  const showOrgTab = await hasSharedOrganization(session.contact.id);
  const validTabs = ["open", "solved", "all", ...(showOrgTab ? ["org"] : [])];
  const tab = tabParam && validTabs.includes(tabParam) ? tabParam : "open";
  const scope = tab === "org" ? "organization" : "mine";
  const all = await listContactRequests(session.tenant.id, session.contact.id, scope);
  const requests =
    tab === "open"
      ? all.filter((r) => OPEN_STATUSES.has(r.status))
      : tab === "solved"
        ? all.filter((r) => r.status === "resolved" || r.status === "closed")
        : all;

  const tabs = showOrgTab ? [...TABS, ["org", "requests.tabOrg"] as const] : TABS;

  return (
    <div className="pt-rise px-9 pb-[60px] pt-12 max-sm:px-[18px] max-sm:py-[30px]">
      <div className="mx-auto flex max-w-[920px] flex-col gap-[22px]">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="pt-title text-4xl leading-[1.1] tracking-[-0.02em] max-sm:text-[27px]">
            {t("requests.title")}
          </h1>
          <span className="flex-1" />
          <Link
            href="/help/requests/new"
            className="grid h-[46px] place-items-center whitespace-nowrap rounded-[10px] px-5 text-[15px] font-semibold text-white hover:no-underline"
            style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
          >
            {t("requests.new")}
          </Link>
        </div>

        <nav className="flex flex-wrap gap-0.5 border-b" style={{ borderColor: "var(--line)" }}>
          {tabs.map(([key, labelKey]) => {
            const active = tab === key;
            return (
              <Link
                key={key}
                href={`/help/requests${key === "open" ? "" : `?tab=${key}`}`}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-3 text-[15px] transition-colors duration-150 hover:no-underline ${active ? "font-semibold" : "font-[450]"}`}
                style={{
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  borderColor: active ? "var(--acc)" : "transparent",
                }}
              >
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-[13px] py-[68px] text-center">
            <svg viewBox="0 0 64 64" width="76" height="76" fill="none" stroke="var(--line)" strokeWidth="2">
              <rect x="12" y="8" width="40" height="48" rx="6" />
              <path d="M22 22h20M22 32h20M22 42h12" stroke="var(--acc-b)" />
            </svg>
            <p className="pt-title text-[23px]">{t("requests.emptyTitle")}</p>
            <p
              className="max-w-[42ch] text-[15.5px] leading-[1.6]"
              style={{ color: "var(--ink-2)", textWrap: "pretty" }}
            >
              {t("requests.emptyBody")}
            </p>
            <Link
              href="/help/requests/new"
              className="mt-1.5 grid h-12 place-items-center rounded-[10px] px-[22px] text-[15px] font-semibold text-white hover:no-underline"
              style={{ background: "var(--cta-a)", boxShadow: "var(--sh-2)" }}
            >
              {t("chrome.submitRequest")}
            </Link>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-2xl border"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              boxShadow: "var(--sh-1)",
            }}
          >
            {requests.map((r) => {
              const badge = statusBadgeStyle(r.status);
              return (
                <Link
                  key={r.number}
                  href={`/help/requests/${r.number}`}
                  className="pt-row flex flex-wrap items-center gap-4 border-b px-5 py-[18px] hover:no-underline"
                  style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
                >
                  <span
                    className="w-[52px] flex-none font-mono text-[12.5px]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    #{r.number}
                  </span>
                  <span className="flex min-w-[180px] flex-1 flex-col gap-[3px]">
                    <span className="text-[15.5px] font-medium">{r.subject}</span>
                    <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                      {activityLabel(r, t)}
                    </span>
                  </span>
                  {r.status === "waiting" && (
                    <span
                      className="whitespace-nowrap rounded-full px-[11px] py-1 text-xs font-semibold"
                      style={{ background: "var(--wait-t)", color: "var(--wait)" }}
                    >
                      {t("requests.awaitingReply")}
                    </span>
                  )}
                  {/* Pastille + libellé : le statut se repère à la couleur avant d'être lu. */}
                  <span
                    className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full py-[5px] pl-2.5 pr-3 text-[12.5px] font-semibold"
                    style={badge}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: badge.color }}
                    />
                    {t(statusKey(r.status))}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
