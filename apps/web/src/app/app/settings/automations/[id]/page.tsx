import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { automationRules, db, teams, users } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Action, Condition } from "@/components/rule-builders";
import { RuleEditorBody } from "@/components/settings-rule-editor";
import { Field, PageHeader, PageShell, SaveBar, TextInput, Toggle } from "@/components/settings-page";
import { saveRule, testRule } from "../actions";

/** Modèles pré-remplis (état vide ST-05). */
const TEMPLATES: Record<
  string,
  { name: string; kind: "trigger" | "scheduled"; all: Condition[]; actions: Action[] }
> = {
  ack: {
    name: "Accusé de réception",
    kind: "trigger",
    all: [{ field: "event", operator: "is", value: "ticket.created" }],
    actions: [
      {
        type: "email_contact",
        value:
          "Bonjour {{contact.name}}, nous avons bien reçu votre demande et revenons vers vous sous 4 heures ouvrées.",
      },
    ],
  },
  escalade: {
    name: "Escalade urgente",
    kind: "trigger",
    all: [{ field: "priority", operator: "is", value: "urgent" }],
    actions: [{ type: "assign_team", value: "" }],
  },
  relance: {
    name: "Relance client à 48 h",
    kind: "scheduled",
    all: [
      { field: "status", operator: "is", value: "waiting" },
      { field: "hours_since_updated", operator: "gte", value: 48 },
    ],
    actions: [
      {
        type: "email_contact",
        value:
          "Bonjour {{contact.name}}, nous restons dans l'attente de votre retour sur le ticket {{ticket.number}}.",
      },
    ],
  },
  cloture: {
    name: "Clôture automatique à J+4",
    kind: "scheduled",
    all: [
      { field: "status", operator: "is", value: "resolved" },
      { field: "hours_since_updated", operator: "gte", value: 96 },
    ],
    actions: [{ type: "set_status", value: "closed" }],
  },
};

/**
 * ST-05 — Éditeur de règle (1000 px) : bloc SI (bordure --open), bloc ALORS (accent),
 * « Tester sur un ticket existant » fonctionnel (simulation, aucune écriture).
 */
export default async function RuleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string; template?: string; saved?: string }>;
}) {
  const { tenant } = await requireAgent();
  const { id } = await params;
  const { kind: kindParam, template: templateKey, saved } = await searchParams;
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

  const template = isNew && templateKey ? TEMPLATES[templateKey] : undefined;
  const kind =
    rule?.kind ?? template?.kind ?? (kindParam === "scheduled" ? "scheduled" : "trigger");

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

  const initialAll = ((rule?.conditionsAll as Condition[]) ?? template?.all ?? []) as Condition[];
  const initialAny = ((rule?.conditionsAny as Condition[]) ?? []) as Condition[];
  const initialActions = ((rule?.actions as Action[]) ?? template?.actions ?? []) as Action[];

  const tabs = [
    { label: "Déclencheurs", href: "/app/settings/automations", active: false },
    { label: "Éditeur", href: "#", active: true },
  ];

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        title="Automatisations"
        subtitle="Règles « quand X alors Y ». L'ordre d'exécution compte."
        tabs={tabs}
      />

      <form action={saveRule} className="st-rise flex flex-col" style={{ gap: 15 }}>
        <input type="hidden" name="ruleId" value={isNew ? "" : rule!.id} />
        <input type="hidden" name="kind" value={kind} />

        <Field
          label="Nom de la règle"
          hint={
            kind === "trigger"
              ? "Déclencheur : évalué à chaque événement (création, mise à jour, message reçu)."
              : "Règle horaire : évaluée périodiquement par le worker (conditions temporelles)."
          }
        >
          <TextInput
            name="name"
            required
            defaultValue={rule?.name ?? template?.name ?? ""}
            placeholder="Escalade des tickets urgents hors horaires"
            style={{ minHeight: 36, padding: "7px 11px", fontSize: 13.5 }}
          />
        </Field>

        <RuleEditorBody
          initialAll={initialAll}
          initialAny={initialAny}
          initialActions={initialActions}
          agents={agents}
          teams={teamRows}
          testAction={testRule}
        />

        <Toggle name="active" defaultChecked={rule?.active ?? true} label="Règle active" />

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/automations" />
      </form>
    </PageShell>
  );
}
