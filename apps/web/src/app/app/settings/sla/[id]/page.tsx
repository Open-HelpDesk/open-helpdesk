import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { db, slaPolicies } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { ConditionsBuilder } from "@/components/rule-builders";
import { saveSlaPolicy } from "../actions";

const PRIORITIES = [
  ["urgent", "Urgente"],
  ["high", "Haute"],
  ["normal", "Normale"],
  ["low", "Basse"],
] as const;

/** ST-07 — Éditeur de politique : conditions d'application + grille des cibles (minutes). */
export default async function SlaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const isNew = id === "new";

  const policy = isNew
    ? undefined
    : (
        await db
          .select()
          .from(slaPolicies)
          .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, id)))
      )[0];
  if (!isNew && !policy) notFound();

  const targets = (policy?.targets ?? {}) as Record<
    string,
    { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
  >;

  const inputStyle = {
    borderColor: "var(--line)",
    background: "var(--bg)",
    color: "var(--ink)",
  } as const;

  return (
    <div>
      <Link href="/app/settings/sla" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Politiques SLA
      </Link>
      <h1 className="mb-5 mt-2 text-lg font-semibold">
        {isNew ? "Nouvelle politique" : `Modifier « ${policy!.name} »`}
      </h1>

      <form action={saveSlaPolicy} className="flex flex-col gap-4">
        <input type="hidden" name="policyId" value={isNew ? "" : policy!.id} />

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          NOM
          <input
            name="name"
            required
            defaultValue={policy?.name ?? ""}
            className="max-w-md rounded-md border px-3 py-2 text-sm font-normal"
            style={inputStyle}
          />
        </label>

        <ConditionsBuilder
          name="conditions"
          label="S'APPLIQUE SI — toutes ces conditions (vide = tous les tickets)"
          initial={(policy?.conditions as never[]) ?? []}
        />

        <fieldset
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <legend className="px-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
            CIBLES PAR PRIORITÉ (en minutes — vide = pas d'échéance)
          </legend>
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr
                  className="text-left font-mono text-[11px] uppercase tracking-wider"
                  style={{ color: "var(--mute)" }}
                >
                  <th className="py-1 pr-4 font-semibold">Priorité</th>
                  <th className="pr-4 font-semibold">1ʳᵉ réponse</th>
                  <th className="pr-4 font-semibold">Réponses suiv.</th>
                  <th className="font-semibold">Résolution</th>
                </tr>
              </thead>
              <tbody>
                {PRIORITIES.map(([key, label]) => (
                  <tr key={key}>
                    <td className="py-1 pr-4 font-medium">{label}</td>
                    {(["firstReplyMin", "nextReplyMin", "resolveMin"] as const).map((col) => (
                      <td key={col} className="pr-4">
                        <input
                          type="number"
                          min={0}
                          name={`t_${key}_${col}`}
                          defaultValue={targets[key]?.[col] ?? ""}
                          className="w-24 rounded-md border px-2 py-1 font-mono text-sm tabular-nums"
                          style={inputStyle}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Enregistrer
          </button>
          <Link
            href="/app/settings/sla"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--line)" }}
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}
