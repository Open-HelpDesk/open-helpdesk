/**
 * Libellés français du moteur de règles — partagés entre le builder (ST-05),
 * les résumés lisibles des listes et l'éditeur SLA (ST-07). Données pures, client-safe.
 */

export const FIELD_LABELS: Record<string, string> = {
  event: "Événement",
  status: "Statut",
  priority: "Priorité",
  channel: "Canal",
  subject: "Sujet",
  tags: "Tags",
  assignee: "Assigné",
  organization: "Organisation",
  hours_since_created: "Heures depuis la création",
  hours_since_updated: "Heures depuis la mise à jour",
};

export const OPERATOR_LABELS: Record<string, string> = {
  is: "est",
  is_not: "n'est pas",
  contains: "contient",
  includes: "inclut",
  empty: "est vide",
  not_empty: "n'est pas vide",
  gte: "≥",
  lte: "≤",
};

export const ACTION_LABELS: Record<string, string> = {
  set_status: "Définir le statut",
  set_priority: "Définir la priorité",
  assign_user: "Assigner à un agent",
  assign_team: "Assigner à une équipe",
  add_tags: "Ajouter des tags",
  email_contact: "Envoyer un email au contact",
};

/** Valeurs proposées par champ (select) ; les autres champs sont en saisie libre. */
export const FIELD_VALUE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  event: [
    { value: "ticket.created", label: "Ticket créé" },
    { value: "ticket.updated", label: "Ticket mis à jour" },
    { value: "message.created", label: "Message reçu" },
  ],
  status: [
    { value: "new", label: "Nouveau" },
    { value: "open", label: "Ouvert" },
    { value: "waiting", label: "En attente" },
    { value: "on_hold", label: "En pause" },
    { value: "resolved", label: "Résolu" },
    { value: "closed", label: "Clos" },
  ],
  priority: [
    { value: "low", label: "Basse" },
    { value: "normal", label: "Normale" },
    { value: "high", label: "Haute" },
    { value: "urgent", label: "Urgente" },
  ],
  channel: [
    { value: "email", label: "Email" },
    { value: "portal", label: "Portail" },
    { value: "widget", label: "Widget" },
    { value: "api", label: "API" },
  ],
};

const VALUELESS_OPERATORS = new Set(["empty", "not_empty"]);

type ConditionLike = { field: string; operator: string; value?: string | number };
type ActionLike = { type: string; value?: unknown };

function valueLabel(c: ConditionLike): string {
  const opts = FIELD_VALUE_OPTIONS[c.field];
  const found = opts?.find((o) => o.value === String(c.value));
  return found?.label ?? String(c.value ?? "");
}

/** « Si sujet contient « urgent » et canal est Email → priorité Urgente · +tags » */
export function ruleSummary(
  conditionsAll: ConditionLike[],
  conditionsAny: ConditionLike[],
  actions: ActionLike[],
): string {
  const conds = [
    ...conditionsAll.map(
      (c) =>
        `${FIELD_LABELS[c.field] ?? c.field} ${OPERATOR_LABELS[c.operator] ?? c.operator}${
          VALUELESS_OPERATORS.has(c.operator) ? "" : ` « ${valueLabel(c)} »`
        }`,
    ),
    ...(conditionsAny.length > 0 ? [`au moins une de ${conditionsAny.length} condition(s)`] : []),
  ];
  const acts = actions.map((a) => {
    switch (a.type) {
      case "set_status":
      case "set_priority": {
        const opts = FIELD_VALUE_OPTIONS[a.type === "set_status" ? "status" : "priority"];
        return `${ACTION_LABELS[a.type]} → ${opts?.find((o) => o.value === a.value)?.label ?? a.value}`;
      }
      case "add_tags":
        return `+tags ${(Array.isArray(a.value) ? a.value : []).join(", ")}`;
      case "email_contact":
        return "email au contact";
      default:
        return ACTION_LABELS[a.type] ?? a.type;
    }
  });
  return `Si ${conds.join(" et ") || "toujours"} → ${acts.join(" · ") || "aucune action"}`;
}
