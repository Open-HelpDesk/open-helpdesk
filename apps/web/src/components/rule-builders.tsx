"use client";

/**
 * Builders conditions / actions (ST-05, réutilisés par ST-07 et les vues) :
 * lignes champ-opérateur-valeur, groupes « toutes » / « au moins une ».
 * L'état est sérialisé en JSON dans un input caché lu par la server action.
 */
import { useState } from "react";
import { X } from "lucide-react";
import {
  ACTION_LABELS,
  FIELD_LABELS,
  FIELD_VALUE_OPTIONS,
  OPERATOR_LABELS,
} from "@/lib/rule-labels";

type Condition = { field: string; operator: string; value?: string | number };
type Action = { type: string; value?: unknown };

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
  const operators = OPERATORS_BY_FIELD[condition.field] ?? ["is"];
  const options = FIELD_VALUE_OPTIONS[condition.field];
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={condition.field}
        onChange={(e) => {
          const field = e.target.value;
          onChange({ field, operator: OPERATORS_BY_FIELD[field]?.[0] ?? "is", value: "" });
        }}
        className="rounded-md border px-2 py-1.5 text-sm"
        style={inputStyle}
      >
        {Object.entries(FIELD_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        className="rounded-md border px-2 py-1.5 text-sm"
        style={inputStyle}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {!VALUELESS.has(condition.operator) &&
        (options ? (
          <select
            value={String(condition.value ?? "")}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="rounded-md border px-2 py-1.5 text-sm"
            style={inputStyle}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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
            className="w-44 rounded-md border px-2 py-1.5 text-sm"
            style={inputStyle}
          />
        ))}
      <button type="button" onClick={onRemove} title="Retirer" style={{ color: "var(--mute)" }}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ConditionsBuilder({
  name,
  label,
  initial,
}: {
  name: string;
  label: string;
  initial: Condition[];
}) {
  const [rows, setRows] = useState<Condition[]>(initial);
  return (
    <fieldset className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <legend className="px-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
        {label}
      </legend>
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
          className="self-start rounded-md border border-dashed px-2 py-1 text-xs"
          style={{ borderColor: "var(--line)", color: "var(--mute)" }}
        >
          + Ajouter une condition
        </button>
      </div>
    </fieldset>
  );
}

export function ActionsBuilder({
  name,
  initial,
  agents,
  teams,
}: {
  name: string;
  initial: Action[];
  agents: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Action[]>(initial);

  function update(i: number, next: Action) {
    setRows(rows.map((r, j) => (j === i ? next : r)));
  }

  return (
    <fieldset className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <legend className="px-1 text-xs font-semibold" style={{ color: "var(--mute)" }}>
        ALORS — actions appliquées dans l'ordre
      </legend>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div className="flex flex-col gap-2">
        {rows.map((a, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <select
              value={a.type}
              onChange={(e) => {
                const type = e.target.value;
                update(i, {
                  type,
                  value: type === "add_tags" ? [] : type === "email_contact" ? "" : "",
                });
              }}
              className="rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            >
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>

            {(a.type === "set_status" || a.type === "set_priority") && (
              <select
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className="rounded-md border px-2 py-1.5 text-sm"
                style={inputStyle}
              >
                <option value="">—</option>
                {FIELD_VALUE_OPTIONS[a.type === "set_status" ? "status" : "priority"]!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {a.type === "assign_user" && (
              <select
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className="rounded-md border px-2 py-1.5 text-sm"
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
                className="rounded-md border px-2 py-1.5 text-sm"
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
            {a.type === "add_tags" && (
              <input
                placeholder="tags séparés par des virgules"
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
                className="w-64 rounded-md border px-2 py-1.5 text-sm"
                style={inputStyle}
              />
            )}
            {a.type === "email_contact" && (
              <textarea
                rows={3}
                placeholder="Corps de l'email — variables : {{contact.name}}, {{ticket.number}}, {{ticket.subject}}"
                value={String(a.value ?? "")}
                onChange={(e) => update(i, { ...a, value: e.target.value })}
                className="w-full max-w-md rounded-md border px-2 py-1.5 text-sm"
                style={inputStyle}
              />
            )}
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              title="Retirer"
              className="mt-2"
              style={{ color: "var(--mute)" }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows([...rows, { type: "set_status", value: "open" }])}
          className="self-start rounded-md border border-dashed px-2 py-1 text-xs"
          style={{ borderColor: "var(--line)", color: "var(--mute)" }}
        >
          + Ajouter une action
        </button>
      </div>
    </fieldset>
  );
}
