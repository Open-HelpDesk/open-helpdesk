"use client";

/**
 * Condition / action builders (ST-05, reused by ST-07 and the saved views):
 * field-operator-value rows on a `1fr 140px 1fr 30px` grid (ST-05 design),
 * "all" / "any" groups. The state is serialized as JSON in a hidden input read
 * by the server action. Optional controlled mode (rows/onChange) for the ST-05
 * editor, which has to read the current state ("Test on a ticket").
 */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { X } from "lucide-react";
import {
  ACTION_KEYS,
  FIELD_KEYS,
  FIELD_VALUE_KEYS,
  OPERATOR_KEYS,
} from "@/lib/rule-labels";
import { FIELD } from "@/components/settings-page";

export type Condition = { field: string; operator: string; value?: string | number };
export type Action = { type: string; value?: unknown };

const NUMERIC_FIELDS = new Set(["hours_since_created", "hours_since_updated"]);
const VALUELESS = new Set(["empty", "not_empty"]);

const OPERATORS_BY_FIELD: Record<string, string[]> = {
  event: ["is", "is_not"],
  status: ["is", "is_not"],
  priority: ["is", "is_not"],
  channel: ["is", "is_not"],
  type: ["is", "is_not", "empty", "not_empty"],
  subject: ["contains"],
  tags: ["includes"],
  assignee: ["empty", "not_empty", "is"],
  team: ["is", "is_not", "empty", "not_empty"],
  organization: ["empty", "not_empty", "is"],
  hours_since_created: ["gte", "lte"],
  hours_since_updated: ["gte", "lte"],
};

const inputStyle = {
  borderColor: "var(--line)",
  background: "var(--bg)",
  color: "var(--ink)",
} as const;

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const operators = OPERATORS_BY_FIELD[condition.field] ?? ["is"];
  const options = FIELD_VALUE_KEYS[condition.field];
  return (
    <div
      className="grid items-center gap-1.5"
      style={{ gridTemplateColumns: "1fr 140px 1fr 30px" }}
    >
      <select
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value;
          onChange({ field, operator: OPERATORS_BY_FIELD[field]?.[0] ?? "is", value: "" });
        }}
        className={`min-w-0 ${FIELD}`}
        style={inputStyle}
      >
        {Object.entries(FIELD_KEYS).map(([v, key]) => (
          <option key={v} value={v}>
            {t(key)}
          </option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className={`min-w-0 ${FIELD}`}
        style={inputStyle}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_KEYS[op] ? t(OPERATOR_KEYS[op]) : op}
          </option>
        ))}
      </select>
      {VALUELESS.has(condition.operator) ? (
        <span />
      ) : options ? (
        <select
          value={String(condition.value ?? "")}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          className={`min-w-0 ${FIELD}`}
          style={inputStyle}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.key)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={NUMERIC_FIELDS.has(condition.field) ? "number" : "text"}
          value={String(condition.value ?? "")}
          onChange={(e) =>
            onChange({
              ...condition,
              value: NUMERIC_FIELDS.has(condition.field)
                ? Number(e.target.value)
                : e.target.value,
            })
          }
          className={`min-w-0 ${FIELD}`}
          style={inputStyle}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        title={t("app.settings.rules.removeRow")}
        className="justify-self-center"
        style={{ color: "var(--ink-3)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ConditionsBuilder({
  name,
  label,
  initial,
  rows: controlled,
  onChange,
  bare,
}: {
  name: string;
  label?: string;
  initial: Condition[];
  /** Controlled mode (ST-05): the state lives in the parent. */
  rows?: Condition[];
  onChange?: (rows: Condition[]) => void;
  /** Without the fieldset frame — used in the IF/THEN blocks of the ST-05 editor. */
  bare?: boolean;
}) {
  const t = useT();
  const [internal, setInternal] = useState<Condition[]>(initial);
  const rows = controlled ?? internal;
  const setRows = (next: Condition[]) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  const body = (
    <>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div className="flex flex-col gap-2">
        {rows.map((c, i) => (
          <ConditionRow
            key={i}
            condition={c}
            onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))}
            onRemove={() => setRows(rows.filter((_, j) => j !== i))}
          />
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, { field: "status", operator: "is", value: "open" }])}
          className="self-start"
          style={{ fontSize: 12.5, fontWeight: 500, color: "var(--acc-2)" }}
        >
          {t("app.settingsNav.addCondition")}
        </button>
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;

  return (
    <fieldset
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
    >
      {label && (
        <legend className="px-1 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
          {label}
        </legend>
      )}
      {body}
    </fieldset>
  );
}

export function ActionsBuilder({
  name,
  initial,
  agents,
  teams,
  rows: controlled,
  onChange,
  bare,
}: {
  name: string;
  initial: Action[];
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  rows?: Action[];
  onChange?: (rows: Action[]) => void;
  bare?: boolean;
}) {
  const t = useT();
  const [internal, setInternal] = useState<Action[]>(initial);
  const rows = controlled ?? internal;
  const setRows = (next: Action[]) => {
    if (!controlled) setInternal(next);
    onChange?.(next);
  };

  function update(i: number, next: Action) {
    setRows(rows.map((r, j) => (j === i ? next : r)));
  }

  const body = (
    <>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div className="flex flex-col gap-2">
        {rows.map((a, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <select
              value={a.type}
              onChange={(e) => {
                const type = e.target.value;
                update(
                  i,
                  type === "assign_round_robin"
                    ? { type }
                    : { type, value: type === "add_tags" ? [] : "" },
                );
              }}
              className={FIELD}
              style={inputStyle}
            >
              {Object.entries(ACTION_KEYS).map(([v, key]) => (
                <option key={v} value={v}>
                  {t(key)}
                </option>
              ))}
            </select>

            {(a.type === "set_status" || a.type === "set_priority") && (
              <select
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className={FIELD}
                style={inputStyle}
              >
                <option value="">—</option>
                {FIELD_VALUE_KEYS[a.type === "set_status" ? "status" : "priority"]!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.key)}
                  </option>
                ))}
              </select>
            )}
            {a.type === "assign_user" && (
              <select
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className={FIELD}
                style={inputStyle}
              >
                <option value="">—</option>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name}
                  </option>
                ))}
              </select>
            )}
            {a.type === "assign_team" && (
              <select
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className={FIELD}
                style={inputStyle}
              >
                <option value="">—</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {a.type === "assign_round_robin" && (
              <span className="px-1 py-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                {t("app.settingsNav.roundRobinHint")}
              </span>
            )}
            {a.type === "add_tags" && (
              <input
                placeholder={t("app.settingsNav.tagsPlaceholder")}
                value={Array.isArray(a.value) ? (a.value as string[]).join(", ") : ""}
                onChange={(e) =>
                  update(i, {
                    ...a,
                    value: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                className={`w-64 ${FIELD}`}
                style={inputStyle}
              />
            )}
            {a.type === "email_contact" && (
              <textarea
                rows={3}
                placeholder={t("app.settings.rules.emailBodyPlaceholder")}
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className={`w-full max-w-md ${FIELD}`}
                style={inputStyle}
              />
            )}
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              title={t("app.settings.rules.removeRow")}
              className="mt-2"
              style={{ color: "var(--ink-3)" }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, { type: "set_status", value: "open" }])}
          className="self-start"
          style={{ fontSize: 12.5, fontWeight: 500, color: "var(--acc-2)" }}
        >
          {t("app.settingsNav.addAction")}
        </button>
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;

  return (
    <fieldset
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
    >
      <legend className="px-1 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
        {t("app.settingsNav.thenActions")}
      </legend>
      {body}
    </fieldset>
  );
}
