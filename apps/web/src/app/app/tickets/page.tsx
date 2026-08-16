import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { DEFAULT_VIEWS, listTickets, viewCounts, type ViewKey } from "@/lib/data";
import { relativeFr } from "@/lib/format";
import { Avatar, PriorityDot, SlaBadge, StatusChip } from "@/components/ticket-bits";

/**
 * AG-03 — Inbox : file de tickets (specs/10).
 * Panneau des vues 240 px avec compteurs + table dense pleine largeur.
 * Restent à venir sur cet écran : filtres rapides, actions groupées, temps réel,
 * navigation clavier j/k (Lot 1, suite).
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { tenant, agent } = await requireAgent();
  const { view: viewParam } = await searchParams;
  const view: ViewKey = (DEFAULT_VIEWS.find((v) => v.key === viewParam)?.key ??
    "open") as ViewKey;

  const [counts, rows] = await Promise.all([
    viewCounts(tenant.id, agent.id),
    listTickets(tenant.id, view, agent.id),
  ]);
  const currentView = DEFAULT_VIEWS.find((v) => v.key === view)!;

  return (
    <div className="flex h-full">
      {/* Panneau des vues — 240 px */}
      <nav
        className="w-60 shrink-0 overflow-y-auto border-r p-3"
        style={{ background: "var(--sunk)", borderColor: "var(--line)" }}
      >
        <p
          className="mb-2 px-2 font-mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--mute)" }}
        >
          Vues
        </p>
        <ul className="flex flex-col gap-0.5">
          {DEFAULT_VIEWS.map((v) => (
            <li key={v.key}>
              <Link
                href={`/app/tickets?view=${v.key}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                style={
                  v.key === view
                    ? { background: "var(--acc-t)", color: "var(--acc)", fontWeight: 600 }
                    : { color: "var(--ink)" }
                }
              >
                {v.label}
                <span
                  className="font-mono text-xs tabular-nums"
                  style={{ color: v.key === view ? "var(--acc)" : "var(--mute)" }}
                >
                  {counts[v.key]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          className="mt-3 w-full rounded-md border border-dashed px-2 py-1.5 text-left text-sm"
          style={{ borderColor: "var(--line)", color: "var(--mute)" }}
        >
          + Nouvelle vue
        </button>
      </nav>

      {/* Table des tickets */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <div
          className="sticky top-0 flex h-11 items-center gap-2 border-b px-4"
          style={{ background: "var(--canvas)", borderColor: "var(--line)" }}
        >
          <h1 className="text-sm font-semibold">{currentView.label}</h1>
          <span className="font-mono text-xs tabular-nums" style={{ color: "var(--mute)" }}>
            {counts[view]}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="text-sm font-medium">Aucun ticket dans cette vue</p>
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Les tickets arrivant par email, portail ou API apparaîtront ici.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-b align-middle"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                >
                  <td className="w-8 pl-4">
                    <PriorityDot priority={t.priority} />
                  </td>
                  <td className="max-w-0 py-2.5 pr-3" style={{ width: "44%" }}>
                    <Link href={`/app/tickets/${t.number}`} className="block">
                      <span className="block truncate font-medium">
                        <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
                          #{t.number}
                        </span>{" "}
                        {t.subject}
                      </span>
                      {t.excerpt && (
                        <span className="block truncate text-xs" style={{ color: "var(--mute)" }}>
                          {t.excerpt}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap pr-3 text-xs" style={{ color: "var(--mute)" }}>
                    {t.requesterName ?? t.requesterEmail}
                    {t.organizationName && (
                      <span className="block truncate">{t.organizationName}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap pr-3">
                    <StatusChip status={t.status} />
                  </td>
                  <td className="whitespace-nowrap pr-3">
                    <SlaBadge
                      firstRepliedAt={t.firstRepliedAt}
                      firstReplyDueAt={t.firstReplyDueAt}
                      resolveDueAt={t.resolveDueAt}
                    />
                  </td>
                  <td className="whitespace-nowrap pr-3">
                    {t.assigneeName ? (
                      <Avatar name={t.assigneeName} size={22} />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--mute)" }}>
                        —
                      </span>
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap pr-4 text-right text-xs tabular-nums"
                    style={{ color: "var(--mute)" }}
                  >
                    {relativeFr(t.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
