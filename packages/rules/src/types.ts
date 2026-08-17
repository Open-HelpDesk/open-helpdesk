/**
 * Moteur d'automatisations (ST-05) et politiques SLA (ST-07) — types partagés.
 * Les conditions et actions sont stockées en jsonb ; ces types sont le contrat.
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
  /** Round-robin : assigne à l'agent actif de l'équipe du ticket le moins chargé. */
  | { type: "assign_round_robin" }
  | { type: "add_tags"; value: string[] }
  /** Corps avec variables : {{ticket.number}}, {{ticket.subject}}, {{contact.name}}. */
  | { type: "email_contact"; value: string };

/** Cibles SLA par priorité, en minutes ouvrées (24/7 tant que businessHoursId est null). */
export type SlaTargets = Partial<
  Record<
    "low" | "normal" | "high" | "urgent",
    { firstReplyMin?: number; nextReplyMin?: number; resolveMin?: number }
  >
>;
