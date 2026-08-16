import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { db, slaPolicies } from "@openhelpdesk/db";
import { asc, eq } from "drizzle-orm";
import { ruleSummary } from "@/lib/rule-labels";
import { deleteSlaPolicy } from "./actions";

function fmtMin(min?: number): string {
  if (!min) return "—";
  return min >= 60 ? `${min / 60} h` : `${min} min`;
}

/**
 * ST-07 — Politiques SLA (specs/11) : liste ordonnée, la première qui matche s'applique.
 * Reste à venir : onglet horaires ouvrés (calcul 24/7 pour l'instant), rappels/escalade
 * configurables, aperçu « un ticket urgent créé vendredi 17 h… ».
 */
export default async function SlaPage() {
  const { tenant } = await requireAgent();
  const policies = await db
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.tenantId, tenant.id))
    .orderBy(asc(slaPolicies.position));

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Politiques SLA</h1>
        <span className="flex-1" />
        <Link
          href="/app/settings/sla/new"
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Nouvelle politique
        </Link>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--mute)" }}>
        Évaluées dans l'ordre : la première politique dont les conditions matchent
        s'applique au ticket. Calcul 24/7 — les calendriers ouvrés arrivent ensuite.
      </p>

      <ul className="flex flex-col gap-3">
        {policies.map((p) => {
          const targets = p.targets as Record<
            string,
            { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
          >;
          return (
            <li
              key={p.id}
              className="rounded-lg border p-4"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Link href={`/app/settings/sla/${p.id}`} className="text-sm font-semibold">
                  {p.name}
                </Link>
                {p.isDefault && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--acc-t)", color: "var(--acc)" }}
                  >
                    Par défaut
                  </span>
                )}
                <span className="flex-1" />
                {!p.isDefault && (
                  <form action={deleteSlaPolicy}>
                    <input type="hidden" name="policyId" value={p.id} />
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--dang)", color: "var(--dang)" }}
                    >
                      Supprimer
                    </button>
                  </form>
                )}
              </div>
              {((p.conditions as never[]) ?? []).length > 0 && (
                <p className="mb-2 text-xs" style={{ color: "var(--mute)" }}>
                  {ruleSummary((p.conditions as never[]) ?? [], [], []).replace(
                    " → aucune action",
                    "",
                  )}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="text-xs" style={{ minWidth: 420 }}>
                  <thead>
                    <tr
                      className="text-left font-mono uppercase tracking-wider"
                      style={{ color: "var(--mute)" }}
                    >
                      <th className="py-1 pr-4 font-semibold">Priorité</th>
                      <th className="pr-4 font-semibold">1ʳᵉ réponse</th>
                      <th className="pr-4 font-semibold">Réponses suiv.</th>
                      <th className="font-semibold">Résolution</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {(["urgent", "high", "normal", "low"] as const).map((prio) => (
                      <tr key={prio}>
                        <td className="py-0.5 pr-4">
                          {{ urgent: "Urgente", high: "Haute", normal: "Normale", low: "Basse" }[prio]}
                        </td>
                        <td className="pr-4">{fmtMin(targets[prio]?.firstReplyMin)}</td>
                        <td className="pr-4">{fmtMin(targets[prio]?.nextReplyMin)}</td>
                        <td>{fmtMin(targets[prio]?.resolveMin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
