import { notFound } from "next/navigation";
import { requireAgent } from "@/lib/session";
import { automationRules, db, teams, users } from "@openhelpdesk/db";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Action, Condition } from "@/components/rule-builders";
import { RuleEditorBody } from "@/components/settings-rule-editor";
import { Field, PageHeader, PageShell, SaveBar, TextInput, Toggle } from "@/components/settings-page";
import { getT, type Translate } from "@/i18n/server";
import { saveRule, testRule } from "../actions";

/** Modèles pré-remplis (état vide ST-05). */
function templates(
  t: Translate,
): Record<
  string,
  { name: string; kind: "trigger" | "scheduled"; all: Condition[]; actions: Action[] }
> {
  return {
    ack: {
      name: t("app.settings.rules.ackReceipt"),
      kind: "trigger",
      all: [{ field: "event", operator: "is", value: "ticket.created" }],
      actions: [{ type: "email_contact", value: t("app.settings.rules.templateAckEmail") }],
    },
    escalade: {
      name: t("app.settings.rules.templateEscalationName"),
      kind: "trigger",
      all: [{ field: "priority", operator: "is", value: "urgent" }],
      actions: [{ type: "assign_team", value: "" }],
    },
    relance: {
      name: t("app.settings.rules.templateFollowUpName"),
      kind: "scheduled",
      all: [
        { field: "status", operator: "is", value: "waiting" },
        { field: "hours_since_updated", operator: "gte", value: 48 },
      ],
      actions: [{ type: "email_contact", value: t("app.settings.rules.templateFollowUpEmail") }],
    },
    cloture: {
      name: t("app.settings.rules.templateCloseName"),
      kind: "scheduled",
      all: [
        { field: "status", operator: "is", value: "resolved" },
        { field: "hours_since_updated", operator: "gte", value: 96 },
      ],
      actions: [{ type: "set_status", value: "closed" }],
    },
  };
}

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
  const t = await getT();
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

  const template = isNew && templateKey ? templates(t)[templateKey] : undefined;
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
    { label: t("app.settings.rules.triggersTab"), href: "/app/settings/automations", active: false },
    { label: t("app.settings.rules.editorTab"), href: "#", active: true },
  ];

  return (
    <PageShell maxWidth={1000}>
      <PageHeader
        title={t("app.settings.rules.automationsTitle")}
        subtitle={t("app.settings.rules.automationsSubtitle")}
        tabs={tabs}
      />

      <form action={saveRule} className="st-rise flex flex-col" style={{ gap: 15 }}>
        <input type="hidden" name="ruleId" value={isNew ? "" : rule!.id} />
        <input type="hidden" name="kind" value={kind} />

        <Field
          label={t("app.settings.rules.ruleName")}
          hint={
            kind === "trigger"
              ? t("app.settings.rules.ruleHintTrigger")
              : t("app.settings.rules.ruleHintScheduled")
          }
        >
          <TextInput
            name="name"
            required
            defaultValue={rule?.name ?? template?.name ?? ""}
            placeholder={t("app.settings.rules.ruleNamePlaceholder")}
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

        <Toggle
          name="active"
          defaultChecked={rule?.active ?? true}
          label={t("app.settings.rules.ruleActive")}
        />

        <SaveBar saved={saved === "1"} cancelHref="/app/settings/automations" />
      </form>
    </PageShell>
  );
}
