import Link from "next/link";
import { requireAgent } from "@/lib/session";
import { automationRules, automationRuns, db } from "@openhelpdesk/db";
import { and, asc, count, eq, gt } from "drizzle-orm";
import { ruleSummary } from "@/lib/rule-labels";
import { relativeFr } from "@/lib/format";
import { deleteRule, duplicateRule, moveRule, toggleRule } from "./actions";

/**
 * ST-05 — Automatisations : liste (specs/11). Deux onglets (déclencheurs / règles
 * horaires), liste ordonnée (l'ordre d'exécution compte), toggle actif, exécutions 7 j.
 * Reste à venir : drag & drop (flèches pour l'instant), « Tester sur un ticket », drawer
 * du journal par règle.
 */
export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { kind: kindParam } = await searchParams;
  const kind = kindParam === "scheduled" ? "scheduled" : "trigger";

  const rules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.kind, kind)))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));

  const runs7d = new Map<string, number>();
  for (const rule of rules) {
    const [row] = await db
      .select({ n: count() })
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.ruleId, rule.id),
          gt(automationRuns.createdAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)),
        ),
      );
    runs7d.set(rule.id, row?.n ?? 0);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Automatisations</h1>
        <span className="flex-1" />
        <Link
          href={`/app/settings/automations/new?kind=${kind}`}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Nouvelle règle
        </Link>
      </div>

      <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--line)" }}>
        {(
          [
            ["trigger", "Déclencheurs"],
            ["scheduled", "Règles horaires"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/app/settings/automations?kind=${k}`}
            className="border-b-2 px-3 py-2 text-sm font-medium"
            style={
              kind === k
                ? { borderColor: "var(--acc)", color: "var(--acc)" }
                : { borderColor: "transparent", color: "var(--mute)" }
            }
          >
            {label}
          </Link>
        ))}
      </div>

      {rules.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: "var(--mute)" }}>
          Aucune règle. Créez la première — accusé de réception, escalade, relance…
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="flex items-center gap-3 rounded-lg border p-3"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              <div className="flex flex-col">
                <form action={moveRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    disabled={index === 0}
                    className="block text-xs disabled:opacity-30"
                    style={{ color: "var(--mute)" }}
                    title="Monter"
                  >
                    ▲
                  </button>
                </form>
                <form action={moveRule}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    disabled={index === rules.length - 1}
                    className="block text-xs disabled:opacity-30"
                    style={{ color: "var(--mute)" }}
                    title="Descendre"
                  >
                    ▼
                  </button>
                </form>
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/settings/automations/${rule.id}`}
                  className="block truncate text-sm font-semibold"
                >
                  {rule.name}
                </Link>
                <p className="truncate text-xs" style={{ color: "var(--mute)" }}>
                  {ruleSummary(
                    (rule.conditionsAll as never[]) ?? [],
                    (rule.conditionsAny as never[]) ?? [],
                    (rule.actions as never[]) ?? [],
                  )}
                </p>
              </div>

              <span className="whitespace-nowrap font-mono text-xs tabular-nums" style={{ color: "var(--mute)" }}>
                {runs7d.get(rule.id)} exéc. / 7 j
              </span>
              {rule.lastRunAt && (
                <span className="whitespace-nowrap text-xs" style={{ color: "var(--mute)" }}>
                  {relativeFr(rule.lastRunAt)}
                </span>
              )}

              <form action={toggleRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  type="submit"
                  role="switch"
                  aria-checked={rule.active}
                  className="relative h-5 w-9 rounded-full"
                  style={{ background: rule.active ? "var(--acc)" : "var(--line)" }}
                  title={rule.active ? "Désactiver" : "Activer"}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                    style={{ left: rule.active ? 18 : 2 }}
                  />
                </button>
              </form>

              <form action={duplicateRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--line)" }}>
                  Dupliquer
                </button>
              </form>
              <form action={deleteRule}>
                <input type="hidden" name="ruleId" value={rule.id} />
                <button
                  className="rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--dang)", color: "var(--dang)" }}
                >
                  Supprimer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
