"use client";

/**
 * ST-05 — Corps interactif de l'éditeur de règle : bloc SI (bordure/en-tête --open),
 * bloc ALORS (accent), et zone pointillée « Tester sur un ticket existant » qui
 * appelle une server action de simulation (aucune écriture) et affiche le
 * résultat vert « #N → la règle s'appliquerait : … ».
 */
import { useState, useTransition } from "react";
import {
  ActionsBuilder,
  ConditionsBuilder,
  type Action,
  type Condition,
} from "@/components/rule-builders";

export type RuleTestResult = { ok: boolean; text: string };

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
  const [all, setAll] = useState<Condition[]>(initialAll);
  const [any, setAny] = useState<Condition[]>(initialAny);
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {/* Bloc SI */}
      <section
        className="overflow-hidden rounded-[10px] border"
        style={{ borderColor: "var(--open)" }}
      >
        <div
          className="flex items-center gap-2 border-b"
          style={{
            padding: "8px 14px",
            background: "var(--open-t)",
            borderColor: "var(--open)",
          }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--open)" }}
          >
            SI
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            toutes ces conditions sont vraies
          </span>
        </div>
        <div style={{ padding: 14, background: "var(--panel)" }}>
          <ConditionsBuilder name="conditionsAll" initial={initialAll} rows={all} onChange={setAll} bare />
          <p
            className="mt-4 mb-2 font-mono font-bold uppercase"
            style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-3)" }}
          >
            Et au moins une de ces conditions (optionnel)
          </p>
          <ConditionsBuilder name="conditionsAny" initial={initialAny} rows={any} onChange={setAny} bare />
        </div>
      </section>

      {/* Bloc ALORS */}
      <section
        className="overflow-hidden rounded-[10px] border"
        style={{ borderColor: "var(--acc)" }}
      >
        <div
          className="flex items-center gap-2 border-b"
          style={{ padding: "8px 14px", background: "var(--acc-t)", borderColor: "var(--acc)" }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--acc)" }}
          >
            ALORS
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            actions appliquées dans l'ordre
          </span>
        </div>
        <div style={{ padding: 14, background: "var(--panel)" }}>
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

      {/* Zone de test */}
      <section
        className="rounded-[10px] border border-dashed"
        style={{ borderColor: "var(--line)", padding: 14, background: "var(--panel)" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await testAction({ conditionsAll: all, conditionsAny: any, actions });
                setResult(r);
              })
            }
            className="rounded-md border px-3 font-medium disabled:opacity-50"
            style={{
              height: 30,
              fontSize: 12.5,
              borderColor: "var(--line)",
              background: "var(--bg)",
              color: "var(--ink)",
            }}
          >
            {pending ? "Test en cours…" : "Tester sur un ticket existant"}
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Simulation sur le ticket le plus récent — aucune modification appliquée.
          </span>
        </div>
        {result && (
          <p
            className="mt-3 rounded-md px-3 py-2 font-mono"
            style={{
              fontSize: 12.5,
              background: result.ok ? "var(--ok-t)" : "var(--sunk)",
              color: result.ok ? "var(--ok)" : "var(--ink-2)",
            }}
          >
            {result.text}
          </p>
        )}
      </section>
    </div>
  );
}
