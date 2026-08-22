/**
 * Automation engine (ST-05) and SLA policies (ST-07) — shared types.
 * Conditions and actions are stored as jsonb; these types are the contract.
 */

export type RuleEvent = "ticket.created" | "ticket.updated" | "message.created";

export type ConditionField =
  | "event"
  | "status"
  | "priority"
  | "channel"
  | "type"
  | "subject"
  | "tags"
  | "assignee"
  | "team"
  | "organization"
  | "hours_since_created"
  | "hours_since_updated";

export type ConditionOperator =
  | "is"
  | "is_not"
  | "contains"
  | "includes"
  | "empty"
  | "not_empty"
  | "gte"
  | "lte";

export type Condition = {
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | number;
};

export type RuleAction =
  | { type: "set_status"; value: "new" | "open" | "waiting" | "on_hold" | "resolved" | "closed" }
  | { type: "set_priority"; value: "low" | "normal" | "high" | "urgent" }
  | { type: "assign_user"; value: string }
  | { type: "assign_team"; value: string }
  /** Round-robin: assigns to the least loaded active agent of the ticket's team. */
  | { type: "assign_round_robin" }
  | { type: "add_tags"; value: string[] }
  /** Body with variables: {{ticket.number}}, {{ticket.subject}}, {{contact.name}}. */
  | { type: "email_contact"; value: string };

/** SLA targets per priority, in business minutes (24/7 as long as businessHoursId is null). */
export type SlaTargets = Partial<
  Record<
    "low" | "normal" | "high" | "urgent",
    { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
  >
>;
