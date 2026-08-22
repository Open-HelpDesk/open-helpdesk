/**
 * Rule engine vocabulary — shared by the builder (ST-05), the readable list
 * summaries, the SLA editor (ST-07) and the macros (ST-06).
 *
 * This file used to carry nothing but French: label tables and two sentence
 * builders that assembled them by concatenation. The whole automations screen
 * therefore stayed in French in a workspace set to Bulgarian.
 *
 * It now carries KEYS, like `lib/format.ts`: rendering goes through `t()`, which
 * knows the tenant's language. The two sentence builders therefore receive `t`,
 * and their templates are themselves keys — "If {conditions} then {actions}"
 * does not have the same word order everywhere.
 *
 * Stays client-safe: nothing here imports server code.
 */
import type { MessageKey } from "@/i18n/dictionaries/en";
import { CHANNEL_KEYS, PRIORITY_KEYS, STATUS_KEYS } from "@/lib/format";

/** What the sentence builders need: translating. */
type Tr = {
  (key: MessageKey, params?: Record<string, string | number>): string;
};

/** Fields a condition can bear on (order of the ST-05 menu). */
export const FIELD_KEYS: Record<string, MessageKey> = {
  event: "app.settings.rules.condFieldEvent",
  status: "app.settings.rules.condFieldStatus",
  priority: "app.settings.rules.condFieldPriority",
  channel: "app.settings.rules.condFieldChannel",
  type: "app.settings.rules.condFieldType",
  subject: "app.settings.rules.condFieldSubject",
  tags: "app.settings.rules.condFieldTags",
  assignee: "app.settings.rules.condFieldAssignee",
  team: "app.settings.rules.condFieldTeam",
  organization: "app.settings.rules.condFieldOrganization",
  hours_since_created: "app.settings.rules.condFieldHoursCreated",
  hours_since_updated: "app.settings.rules.condFieldHoursUpdated",
};

/**
 * Operators. The two numeric comparisons come out as a symbol in French, but
 * they go through the dictionary like the others: a language that would rather
 * have a word must be able to say so, and a table with two regimes would be a
 * pitfall for the next one.
 */
export const OPERATOR_KEYS: Record<string, MessageKey> = {
  is: "app.settings.rules.opIs",
  is_not: "app.settings.rules.opIsNot",
  contains: "app.settings.rules.opContains",
  includes: "app.settings.rules.opIncludes",
  empty: "app.settings.rules.opEmpty",
  not_empty: "app.settings.rules.opNotEmpty",
  gte: "app.settings.rules.opGte",
  lte: "app.settings.rules.opLte",
};

export const ACTION_KEYS: Record<string, MessageKey> = {
  set_status: "app.settings.rules.actSetStatus",
  set_priority: "app.settings.rules.actSetPriority",
  assign_user: "app.settings.rules.actAssignUser",
  assign_team: "app.settings.rules.actAssignTeam",
  assign_round_robin: "app.settings.rules.actAssignRoundRobin",
  add_tags: "app.settings.rules.actAddTags",
  email_contact: "app.settings.rules.actEmailContact",
};

/**
 * Values offered per field (select); the other fields are free-form input.
 *
 * Statuses, priorities and channels come from the shared tables in
 * `lib/format.ts` rather than from a key set of their own: they are the same
 * labels as those of the inbox and its filters, and two sets would end up
 * diverging.
 */
export const FIELD_VALUE_KEYS: Record<string, { value: string; key: MessageKey }[]> = {
  event: [
    { value: "ticket.created", key: "app.settings.rules.eventTicketCreated" },
    { value: "ticket.updated", key: "app.settings.rules.eventTicketUpdated" },
    { value: "message.created", key: "app.settings.rules.eventMessageCreated" },
  ],
  status: Object.entries(STATUS_KEYS).map(([value, key]) => ({ value, key })),
  priority: Object.entries(PRIORITY_KEYS).map(([value, key]) => ({ value, key })),
  channel: Object.entries(CHANNEL_KEYS).map(([value, key]) => ({ value, key })),
};

/** Custom field types (ST-04). */
export const FIELD_TYPE_KEYS: Record<string, MessageKey> = {
  text: "app.settings.rules.typeText",
  select: "app.settings.rules.typeSelect",
  multi_select: "app.settings.rules.typeMultiSelect",
  date: "app.settings.rules.typeDate",
  number: "app.settings.rules.typeNumber",
  checkbox: "app.settings.rules.typeCheckbox",
};

const VALUELESS_OPERATORS = new Set(["empty", "not_empty"]);
const DURATION_FIELDS = new Set(["hours_since_created", "hours_since_updated"]);

type ConditionLike = { field: string; operator: string; value?: string | number };
type ActionLike = { type: string; value?: unknown };

function valueLabel(t: Tr, c: ConditionLike): string {
  const found = FIELD_VALUE_KEYS[c.field]?.find((o) => o.value === String(c.value));
  return found ? t(found.key) : String(c.value ?? "");
}

/**
 * A condition, as a sentence fragment.
 *
 * One deliberate departure from the French mockup: field names are no longer
 * lowercased. `toLowerCase()` is wrong as soon as a language capitalises its
 * nouns — German writes "Priorität", not "priorität" — and providing a second
 * set of twelve lowercase labels for a difference of case would have cost more
 * than it brings.
 */
function conditionText(t: Tr, c: ConditionLike, teamNames?: Map<string, string>): string {
  // The event reads on its own, without a field name.
  if (c.field === "event") return valueLabel(t, c);
  // "unassigned" rather than "Assignee is empty".
  if (c.field === "assignee" && c.operator === "empty") {
    return t("app.settings.rules.summaryUnassigned");
  }
  if (c.field === "assignee" && c.operator === "not_empty") {
    return t("app.settings.rules.summaryAssigned");
  }
  // Age. The duration stays in the parser's tokens: see formatDurationTokens,
  // at the bottom of this file.
  if (DURATION_FIELDS.has(c.field)) {
    const hours = Number(c.value ?? 0);
    const duration = hours >= 24 && hours % 24 === 0 ? `${hours / 24} j` : `${hours} h`;
    return t("app.settings.rules.summarySince", { duration });
  }
  const fieldKey = FIELD_KEYS[c.field];
  const field = fieldKey ? t(fieldKey) : c.field;
  const operatorKey = OPERATOR_KEYS[c.operator];
  if (VALUELESS_OPERATORS.has(c.operator)) {
    return t("app.settings.rules.summaryConditionNoValue", {
      field,
      operator: operatorKey ? t(operatorKey) : c.operator,
    });
  }
  // The summary shortens "is" to an equals sign: it is a symbol, it does not get
  // translated, and it fits in a list row where the word would not.
  const operator = c.operator === "is" ? "=" : operatorKey ? t(operatorKey) : c.operator;
  const value =
    c.field === "team" ? (teamNames?.get(String(c.value)) ?? valueLabel(t, c)) : valueLabel(t, c);
  return t("app.settings.rules.summaryCondition", { field, operator, value });
}

function actionText(t: Tr, a: ActionLike, teamNames?: Map<string, string>): string {
  switch (a.type) {
    case "set_status": {
      const opt = FIELD_VALUE_KEYS.status?.find((o) => o.value === a.value);
      return t("app.settings.rules.summarySetStatus", {
        value: opt ? t(opt.key) : String(a.value),
      });
    }
    case "set_priority": {
      const opt = FIELD_VALUE_KEYS.priority?.find((o) => o.value === a.value);
      return t("app.settings.rules.summarySetPriority", {
        value: opt ? t(opt.key) : String(a.value),
      });
    }
    case "assign_team":
      return t("app.settings.rules.summaryAssignTeam", {
        team: teamNames?.get(String(a.value)) ?? t("app.settings.rules.summaryAnyTeam"),
      });
    case "assign_user":
      return t("app.settings.rules.summaryAssignUser");
    case "assign_round_robin":
      return t("app.settings.rules.summaryRoundRobin");
    case "add_tags":
      return t("app.settings.rules.summaryAddTags", {
        tags: (Array.isArray(a.value) ? a.value : []).join(", "),
      });
    case "email_contact":
      return t("app.settings.rules.summaryEmailContact");
    default: {
      const key = ACTION_KEYS[a.type];
      return key ? t(key) : a.type;
    }
  }
}

/**
 * A rule's conditions, without the actions.
 *
 * Exposed because the SLA editor only displays this half: it used to build the
 * whole sentence then strip its beginning and its end — `.replace(/^Si /, "")`
 * followed by `.replace(" → aucune action", "")`. Two French turns of phrase,
 * which stripped nothing any more as soon as the workspace changed language and
 * left the complete sentence in a table column.
 */
export function conditionsSummary(
  t: Tr,
  conditionsAll: ConditionLike[],
  conditionsAny: ConditionLike[],
  teamNames?: Map<string, string>,
): string {
  const fragments: { text: string; duration: boolean }[] = conditionsAll.map((c) => ({
    text: conditionText(t, c, teamNames),
    duration: DURATION_FIELDS.has(c.field),
  }));
  if (conditionsAny.length > 0) {
    fragments.push({
      text: t("app.settings.rules.summaryAnyOf", { count: conditionsAny.length }),
      duration: false,
    });
  }
  // An age completes the condition that precedes it rather than counting as one
  // more condition: "status = Pending for 2 j". The attachment is decided on the
  // FIELD, not on the rendered text — searching the translation for a "for"
  // would assume that every language puts that word first, which Hungarian and
  // Finnish do not.
  const parts = fragments.reduce<string[]>((acc, b) => {
    if (b.duration && acc.length > 0) {
      acc[acc.length - 1] = `${acc[acc.length - 1]} ${b.text}`;
      return acc;
    }
    acc.push(b.text);
    return acc;
  }, []);
  return parts.join(` ${t("app.settings.rules.summaryAnd")} `) ||
    t("app.settings.rules.summaryAlways");
}

/**
 * A rule's actions, without the conditions.
 *
 * Exposed because the rule test screen only needs this half: it used to build
 * the whole sentence then strip its beginning with
 * `.replace(/^Si toujours → /, "")` — a French expression, which stripped
 * nothing any more as soon as the workspace changed language and left "Si
 * toujours" at the head of the test message.
 */
export function actionsSummary(
  t: Tr,
  actions: ActionLike[],
  teamNames?: Map<string, string>,
): string {
  const acts = actions.map((a) => actionText(t, a, teamNames));
  return acts.join(" · ") || t("app.settings.rules.journalNoAction");
}

/**
 * Readable summary of a rule, in the style of the design: one list row, shorter
 * than the builder's form.
 */
export function ruleSummary(
  t: Tr,
  conditionsAll: ConditionLike[],
  conditionsAny: ConditionLike[],
  actions: ActionLike[],
  teamNames?: Map<string, string>,
): string {
  return t("app.settings.rules.summaryPattern", {
    conditions: conditionsSummary(t, conditionsAll, conditionsAny, teamNames),
    actions: actionsSummary(t, actions, teamNames),
  });
}

/** Summary of a macro's actions (ST-06), as one list row. */
export function macroActionsSummary(
  t: Tr,
  actions: ActionLike[],
  teamNameById?: Map<string, string>,
): string {
  const parts = actions.map((a) => {
    switch (a.type) {
      case "insert_text":
        return t("app.settings.rules.macroInsertText");
      case "insert_note":
        return t("app.settings.rules.macroInsertNote");
      case "set_status": {
        const opt = FIELD_VALUE_KEYS.status?.find((o) => o.value === a.value);
        return t("app.settings.rules.macroSummaryStatus", {
          value: opt ? t(opt.key) : String(a.value),
        });
      }
      case "set_priority": {
        const opt = FIELD_VALUE_KEYS.priority?.find((o) => o.value === a.value);
        return t("app.settings.rules.macroSummaryPriority", {
          value: opt ? t(opt.key) : String(a.value),
        });
      }
      case "assign_team":
        return t("app.settings.rules.macroSummaryTeam", {
          team:
            teamNameById?.get(String(a.value ?? "")) ??
            t("app.settings.rules.macroSummaryAnyTeam"),
        });
      case "assign_user":
        return t("app.settings.rules.macroSummaryAssign");
      case "add_tags":
        return t("app.settings.rules.macroSummaryTag", {
          tags: (Array.isArray(a.value) ? a.value : []).join(", "),
        });
      default:
        return String(a.type);
    }
  });
  return parts.join(" · ") || t("app.settings.rules.macroSummaryNone");
}

/* ---------------------------------------------------------------------------
 * SLA durations — a SYNTAX, not a label
 *
 * These two functions used to be called `formatDurationFr` / `parseDurationFr`,
 * which made them look like French to translate. It is the opposite: the value
 * produced is fed back as the default value of the ST-07 input field, and read
 * again by the parser at the next save. The tokens min, h and j are therefore an
 * exchange format, identical in every language — translating them would quite
 * simply make saving impossible. That is why the field's help cites and glosses
 * them instead of replacing them.
 * ------------------------------------------------------------------------- */

/** "15 min", "4 h", "2 j" — parser tokens, never translated. */
export function formatDurationTokens(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} j`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Parses "15 min" / "4 h" / "2 j" (also "90" = minutes) into minutes. */
export function parseDurationTokens(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(min|mn|m|h|j|jour|jours)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "min";
  if (unit === "h") return Math.round(n * 60);
  if (unit === "j" || unit === "jour" || unit === "jours") return Math.round(n * 24 * 60);
  return Math.round(n);
}
