"use client";

/**
 * ST-05 — Interactive body of the rule editor, following the design template:
 * IF block (--open border/header) with a SINGLE condition group and a segmented
 * control "{t("app.settingsNav.matches")} all / at least one", THEN block (--acc-b border), and
 * a dashed area whose result shows on the same line as the button.
 *
 * The match mode picks the submitted column: "all" → conditionsAll,
 * "at least one" → conditionsAny (the other one is sent empty).
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

/** The two modes of the selector; the label is a key. */
const MATCH_MODES = [
  { key: "all" as const, label: "app.settings.rules.matchAll" as const },
  { key: "any" as const, label: "app.settings.rules.matchAny" as const },
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
  // An existing rule normally has only one group filled; "at least one" wins when
  // both are, so as not to lose conditions on display.
  const startsAny = initialAny.length > 0;
  const [mode, setMode] = useState<"all" | "any">(startsAny ? "any" : "all");
  const [rows, setRows] = useState<Condition[]>(startsAny ? initialAny : initialAll);
  const [actions, setActions] = useState<Action[]>(initialActions);
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const t = useT();
  // The sentence frame follows the mode: "… all THE conditions" against
  // "… at least one OF THE conditions". A single frame was wrong in half the
  // cases, in French as in German.
  const [matchBefore, matchAfter] = t.parts(
    mode === "all"
      ? "app.settings.rules.matchAllPattern"
      : "app.settings.rules.matchAnyPattern",
    "mode",
  );
  const [pending, startTransition] = useTransition();

  const submittedName = mode === "all" ? "conditionsAll" : "conditionsAny";
  const emptyName = mode === "all" ? "conditionsAny" : "conditionsAll";

  return (
    <div className="flex flex-col gap-4">
      {/* IF block */}
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
            {t("app.settings.rules.matchIf")}
          </span>
          {/* The sentence surrounds the selector: it is split around {mode} so
              that each language places its words as it likes — German puts its
              verb at the end. */}
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{matchBefore}</span>
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
                {t(m.label)}
              </button>
            ))}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{matchAfter}</span>
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

      {/* THEN block */}
      <section
        className="overflow-hidden rounded-[10px] border"
        style={{ borderColor: "var(--acc-b)" }}
      >
        <div
          className="flex items-center gap-2 border-b"
          style={{ padding: "9px 13px", background: "var(--acc-t)", borderColor: "var(--acc-b)" }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--acc)" }}>
            {t("app.settings.rules.matchThen")}
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

      {/* Test area — result on the same line as the button (design) */}
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
            {pending
              ? t("app.settings.rules.testRunning")
              : t("app.settings.rules.testOnTicket")}
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
