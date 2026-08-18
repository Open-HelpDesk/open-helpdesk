"use client";

/**
 * ST-05 — Corps interactif de l'éditeur de règle, au gabarit du design :
 * bloc SI (bordure/en-tête --open) avec UN seul groupe de conditions et un segmented
 * control « {t("app.settingsNav.matches")} toutes / au moins une », bloc ALORS (bordure --acc-b), et
 * zone pointillée dont le résultat s'affiche sur la même ligne que le bouton.
 *
 * Le mode de correspondance choisit la colonne soumise : « toutes » → conditionsAll,
 * « au moins une » → conditionsAny (l'autre est envoyée vide).
 */
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import {
  ActionsBuilder,
  ConditionsBuilder,
  type Action,
  type Condition,
} from "@/components/rule-builders";

export type RuleTestResult = { ok: boolean; text: string };

const MATCH_MODES = [
  { key: "all" as const, label: "toutes" },
  { key: "any" as const, label: "au moins une" },
];

export function RuleEditorBody({
  initialAll,
  initialAny,
  initialActions,
  agents,
  teams,
  testAction,
}: {
  initialAll: Condition[];
  initialAny: Condition[];
  initialActions: Action[];
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  testAction: (payload: {
    conditionsAll: Condition[];
    conditionsAny: Condition[];
    actions: Action[];
  }) => Promise<RuleTestResult>;
}) {
  // Une règle existante n'a normalement qu'un groupe rempli ; « au moins une » gagne
  // quand les deux le sont, pour ne pas perdre de conditions à l'affichage.
  const startsAny = initialAny.length > 0;
  const [mode, setMode] = useState<"all" | "any">(startsAny ? "any" : "all");
  const [rows, setRows] = useState<Condition[]>(startsAny ? initialAny : initialAll);
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const t = useT();
  const [pending, startTransition] = useTransition();

  const submittedName = mode === "all" ? "conditionsAll" : "conditionsAny";
  const emptyName = mode === "all" ? "conditionsAny" : "conditionsAll";

  return (
    <div className="flex flex-col gap-4">
      {/* Bloc SI */}
      <section
        className="overflow-hidden rounded-[10px] border"
        style={{ borderColor: "var(--open)" }}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b"
          style={{
            padding: "9px 13px",
            background: "var(--open-t)",
            borderColor: "var(--open)",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--open)" }}>
            SI
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Correspond à</span>
          <span
            className="inline-flex items-center"
            style={{ background: "var(--panel)", borderRadius: 7, padding: 2 }}
          >
            {MATCH_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: mode === m.key ? 600 : 400,
                  color: mode === m.key ? "var(--ink)" : "var(--ink-2)",
                  background: mode === m.key ? "var(--sunk)" : "transparent",
                }}
              >
                {m.label}
              </button>
            ))}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>les conditions</span>
        </div>
        <div style={{ padding: 13, background: "var(--panel)" }}>
          <input type="hidden" name={emptyName} value="[]" />
          <ConditionsBuilder
            key={submittedName}
            name={submittedName}
            initial={rows}
            rows={rows}
            onChange={setRows}
            bare
          />
        </div>
      </section>

      {/* Bloc ALORS */}
      <section
        className="overflow-hidden rounded-[10px] border"
        style={{ borderColor: "var(--acc-b)" }}
      >
        <div
          className="flex items-center gap-2 border-b"
          style={{ padding: "9px 13px", background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--acc)" }}>
            ALORS
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            {t("app.settingsNav.actionsInOrder")}
          </span>
        </div>
        <div style={{ padding: 13, background: "var(--panel)" }}>
          <ActionsBuilder
            name="actions"
            initial={initialActions}
            agents={agents}
            teams={teams}
            rows={actions}
            onChange={setActions}
            bare
          />
        </div>
      </section>

      {/* Zone de test — résultat sur la même ligne que le bouton (design) */}
      <section
        className="border border-dashed"
        style={{ borderColor: "var(--line)", borderRadius: 9, padding: 13, background: "var(--panel)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await testAction({
                  conditionsAll: mode === "all" ? rows : [],
                  conditionsAny: mode === "any" ? rows : [],
                  actions,
                });
                setResult(r);
              })
            }
            className="rounded-md border font-semibold disabled:opacity-50"
            style={{
              height: 32,
              padding: "0 13px",
              fontSize: 13,
              borderColor: "var(--line)",
              background: "var(--bg)",
              color: "var(--ink-2)",
            }}
          >
            {pending ? "Test en cours…" : "Tester sur un ticket existant"}
          </button>
          {result ? (
            <span
              className="min-w-0"
              style={{
                fontSize: 12.5,
                color: result.ok ? "var(--ok)" : "var(--ink-2)",
              }}
            >
              {result.text}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {t("app.settingsNav.simulationHint")}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
