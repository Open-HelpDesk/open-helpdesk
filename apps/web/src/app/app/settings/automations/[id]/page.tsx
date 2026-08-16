import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { automationRules, db, teams, users } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { ActionsBuilder, ConditionsBuilder } from "@/components/rule-builders";
import { saveRule } from "../actions";

/**
 * ST-05 — Éditeur de règle : bloc SI (toutes / au moins une) + bloc ALORS (actions
 * empilées). Reste à venir : « Tester sur un ticket existant » avec résultat simulé.
 */
export default async function RuleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const { kind: kindParam } = await searchParams;
  const isNew = id === "new";

  const rule = isNew
    ? undefined
    : (
        await db
          .select()
          .from(automationRules)
          .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, id)))
      )[0];
  if (!isNew && !rule) notFound();

  const kind = rule?.kind ?? (kindParam === "scheduled" ? "scheduled" : "trigger");

  const [agents, teamRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), ne(users.status, "disabled")))
      .orderBy(asc(users.name)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.tenantId, tenant.id))
      .orderBy(asc(teams.name)),
  ]);

  return (
    <div>
      <Link href="/app/settings/automations" className="font-mono text-xs" style={{ color: "var(--mute)" }}>
        ← Automatisations
      </Link>
      <h1 className="mb-1 mt-2 text-lg font-semibold">
        {isNew ? "Nouvelle règle" : `Modifier « ${rule!.name} »`}
      </h1>
      <p className="mb-5 text-sm" style={{ color: "var(--mute)" }}>
        {kind === "trigger"
          ? "Déclencheur : évalué à chaque événement (création, mise à jour, message reçu)."
          : "Règle horaire : évaluée périodiquement par le worker (conditions temporelles)."}
      </p>

      <form action={saveRule} className="flex flex-col gap-4">
        <input type="hidden" name="ruleId" value={isNew ? "" : rule!.id} />
        <input type="hidden" name="kind" value={kind} />

        <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
          NOM DE LA RÈGLE
          <input
            name="name"
            required
            defaultValue={rule?.name ?? ""}
            className="max-w-md rounded-md border px-3 py-2 text-sm font-normal"
            style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--ink)" }}
          />
        </label>

        <ConditionsBuilder
          name="conditionsAll"
          label="SI — toutes ces conditions"
          initial={(rule?.conditionsAll as never[]) ?? []}
        />
        <ConditionsBuilder
          name="conditionsAny"
          label="SI — au moins une de ces conditions (optionnel)"
          initial={(rule?.conditionsAny as never[]) ?? []}
        />
        <ActionsBuilder
          name="actions"
          initial={(rule?.actions as never[]) ?? []}
          agents={agents}
          teams={teamRows}
        />

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
          Règle active
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--acc)" }}
          >
            Enregistrer
          </button>
          <Link
            href="/app/settings/automations"
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
