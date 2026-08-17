import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalContact } from "@/lib/portal-auth";
import {
  PORTAL_STATUS_LABELS,
  hasSharedOrganization,
  listContactRequests,
  type PortalRequestRow,
} from "@/lib/portal-data";
import { firstNameFr, relativeLongFr, sinceFr } from "../../portal-format";

const OPEN_STATUSES = new Set(["new", "open", "waiting", "on_hold"]);

const TABS = [
  ["open", "Ouvertes"],
  ["solved", "Résolues"],
  ["all", "Toutes"],
] as const;

/** Couleurs de badge statut (vocabulaire client, PT-05). */
function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === "waiting") return { background: "var(--wait-t)", color: "var(--wait)" };
  if (status === "resolved") return { background: "var(--ok-t)", color: "var(--ok)" };
  if (status === "closed") return { background: "var(--closed-t)", color: "var(--closed)" };
  return { background: "var(--open-t)", color: "var(--open)" };
}

/** « Réponse de Marie il y a 3 h », « En attente de votre réponse depuis hier »… */
function activityLabel(r: PortalRequestRow): string {
  if (r.status === "resolved") return `Résolue ${relativeLongFr(r.resolvedAt ?? r.updatedAt)}`;
  if (r.status === "closed") return `Fermée ${relativeLongFr(r.closedAt ?? r.updatedAt)}`;
  if (r.status === "waiting")
    return `En attente de votre réponse ${sinceFr(r.lastMessage?.createdAt ?? r.updatedAt)}`;
  const last = r.lastMessage;
  if (last?.authorType === "agent" && last.authorName)
    return `Réponse de ${firstNameFr(last.authorName)} ${relativeLongFr(last.createdAt)}`;
  if (last && r.messageCount > 1) return `Vous avez répondu ${relativeLongFr(last.createdAt)}`;
  return `Créée ${relativeLongFr(r.createdAt)}`;
}

/** PT-05 — Mes demandes : onglets, lignes réf/sujet/activité/badges, état vide verbatim. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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

  const tabs: ReadonlyArray<readonly [string, string]> = showOrgTab
    ? [...TABS, ["org", "Demandes de mon organisation"] as const]
    : TABS;

  return (
    <div className="pt-rise px-8 py-11 max-sm:px-[18px] max-sm:py-7">
      <div className="mx-auto flex max-w-[900px] flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3.5">
          <h1 className="text-[30px] font-semibold tracking-[-0.025em]">Mes demandes</h1>
          <span className="flex-1" />
          <Link
            href="/help/requests/new"
            className="grid h-11 place-items-center rounded-[9px] px-[18px] text-[15px] font-semibold text-white hover:no-underline"
            style={{ background: "var(--acc)" }}
          >
            Nouvelle demande
          </Link>
        </div>

        <nav className="flex flex-wrap gap-0.5 border-b" style={{ borderColor: "var(--line)" }}>
          {tabs.map(([key, label]) => {
            const active = tab === key;
            return (
              <Link
                key={key}
                href={`/help/requests${key === "open" ? "" : `?tab=${key}`}`}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-[11px] text-[15px] hover:no-underline ${active ? "font-semibold" : "font-[450]"}`}
                style={{
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  borderColor: active ? "var(--acc)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-[60px] text-center">
            <svg viewBox="0 0 64 64" width="70" height="70" fill="none" stroke="var(--line)" strokeWidth="2">
              <rect x="12" y="8" width="40" height="48" rx="5" />
              <path d="M22 22h20M22 32h20M22 42h12" stroke="var(--acc-b)" />
            </svg>
            <p className="text-[19px] font-semibold">Aucune demande</p>
            <p
              className="max-w-[380px] text-[15.5px]"
              style={{ color: "var(--ink-2)", textWrap: "pretty" }}
            >
              Vos demandes de support apparaîtront ici, avec leur statut et l'historique des
              échanges.
            </p>
            <Link
              href="/help/requests/new"
              className="grid h-[46px] place-items-center rounded-[9px] px-5 text-[15px] font-semibold text-white hover:no-underline"
              style={{ background: "var(--acc)" }}
            >
              Soumettre une demande
            </Link>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl border"
            style={{ background: "var(--panel)", borderColor: "var(--line)" }}
          >
            {requests.map((r) => (
              <Link
                key={r.number}
                href={`/help/requests/${r.number}`}
                className="pt-row flex flex-wrap items-center gap-4 border-b px-[18px] py-4 hover:no-underline"
                style={{ borderColor: "var(--line-2)", color: "var(--ink)" }}
              >
                <span className="w-[52px] flex-none font-mono text-[13px]" style={{ color: "var(--ink-3)" }}>
                  #{r.number}
                </span>
                <span className="flex min-w-[180px] flex-1 flex-col gap-0.5">
                  <span className="text-[15.5px] font-medium">{r.subject}</span>
                  <span className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                    {activityLabel(r)}
                  </span>
                </span>
                {r.status === "waiting" && (
                  <span
                    className="whitespace-nowrap rounded-[20px] px-2.5 py-[3px] text-[12.5px] font-semibold"
                    style={{ background: "var(--wait-t)", color: "var(--wait)" }}
                  >
                    Réponse attendue
                  </span>
                )}
                <span
                  className="whitespace-nowrap rounded-[20px] px-[11px] py-[3px] text-[13px] font-semibold"
                  style={statusBadgeStyle(r.status)}
                >
                  {PORTAL_STATUS_LABELS[r.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
