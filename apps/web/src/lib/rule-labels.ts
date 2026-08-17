/**
 * Libellés français du moteur de règles — partagés entre le builder (ST-05),
 * les résumés lisibles des listes et l'éditeur SLA (ST-07). Données pures, client-safe.
 */

export const FIELD_LABELS: Record<string, string> = {
  event: "Événement",
  status: "Statut",
  priority: "Priorité",
  channel: "Canal",
  type: "Type",
  subject: "Sujet",
  tags: "Tags",
  assignee: "Assigné",
  team: "Équipe",
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
  assign_round_robin: "Assigner au prochain agent (round-robin)",
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

/** Libellés FR des types de champs personnalisés (ST-04). */
export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texte",
  select: "Liste",
  multi_select: "Multi-sélection",
  date: "Date",
  number: "Nombre",
  checkbox: "Case à cocher",
};

const VALUELESS_OPERATORS = new Set(["empty", "not_empty"]);

type ConditionLike = { field: string; operator: string; value?: string | number };
type ActionLike = { type: string; value?: unknown };

function valueLabel(c: ConditionLike): string {
  const opts = FIELD_VALUE_OPTIONS[c.field];
  const found = opts?.find((o) => o.value === String(c.value));
  return found?.label ?? String(c.value ?? "");
}

/**
 * Résumé lisible au style du design : « Si ticket créé → envoyer un email au contact »,
 * « Si priorité = Urgente → assigner à Escalade », « Si statut = En attente depuis 48 h ».
 * Volontairement plus court que le builder : c'est une ligne de liste, pas un formulaire.
 */
function conditionText(c: ConditionLike, teamNames?: Map<string, string>): string {
  // L'événement se lit seul : « ticket créé », sans nom de champ.
  if (c.field === "event") return valueLabel(c).toLowerCase();
  // « non assigné » plutôt que « Assigné est vide ».
  if (c.field === "assignee" && c.operator === "empty") return "non assigné";
  if (c.field === "assignee" && c.operator === "not_empty") return "assigné";
  // Ancienneté : « depuis 48 h » ou « depuis 4 j ».
  if (c.field === "hours_since_created" || c.field === "hours_since_updated") {
    const hours = Number(c.value ?? 0);
    const duration = hours >= 24 && hours % 24 === 0 ? `${hours / 24} j` : `${hours} h`;
    return `depuis ${duration}`;
  }
  const field = FIELD_LABELS[c.field]?.toLowerCase() ?? c.field;
  if (VALUELESS_OPERATORS.has(c.operator)) {
    return `${field} ${OPERATOR_LABELS[c.operator] ?? c.operator}`;
  }
  const operator = c.operator === "is" ? "=" : (OPERATOR_LABELS[c.operator] ?? c.operator);
  const value =
    c.field === "team" ? (teamNames?.get(String(c.value)) ?? valueLabel(c)) : valueLabel(c);
  return `${field} ${operator} ${value}`;
}

function actionText(a: ActionLike, teamNames?: Map<string, string>): string {
  switch (a.type) {
    case "set_status": {
      const label = FIELD_VALUE_OPTIONS.status?.find((o) => o.value === a.value)?.label;
      return `passer en ${label ?? String(a.value)}`;
    }
    case "set_priority": {
      const label = FIELD_VALUE_OPTIONS.priority?.find((o) => o.value === a.value)?.label;
      return `priorité ${label ?? String(a.value)}`;
    }
    case "assign_team":
      return `assigner à ${teamNames?.get(String(a.value)) ?? "une équipe"}`;
    case "assign_user":
      return "assigner à un agent";
    case "assign_round_robin":
      return "assigner au prochain agent";
    case "add_tags":
      return `ajouter ${(Array.isArray(a.value) ? a.value : []).join(", ")}`;
    case "email_contact":
      return "envoyer un email au contact";
    default:
      return (ACTION_LABELS[a.type] ?? a.type).toLowerCase();
  }
}

export function ruleSummary(
  conditionsAll: ConditionLike[],
  conditionsAny: ConditionLike[],
  actions: ActionLike[],
  teamNames?: Map<string, string>,
): string {
  const conds = [
    ...conditionsAll.map((c) => conditionText(c, teamNames)),
    ...(conditionsAny.length > 0
      ? [`au moins une de ${conditionsAny.length} condition${conditionsAny.length > 1 ? "s" : ""}`]
      : []),
  ];
  const acts = actions.map((a) => actionText(a, teamNames));
  // Une durée complète la condition précédente : « statut = En attente depuis 2 j ».
  const phrase = conds.reduce<string[]>((acc, part) => {
    if (part.startsWith("depuis ") && acc.length > 0) {
      acc[acc.length - 1] = `${acc[acc.length - 1]} ${part}`;
      return acc;
    }
    acc.push(part);
    return acc;
  }, []);
  return `Si ${phrase.join(" et ") || "toujours"} → ${acts.join(" · ") || "aucune action"}`;
}

/**
 * Résumé des actions d'une macro (ST-06) : « Insérer un texte · Statut → Ouvert »,
 * « Note interne · Priorité → Haute · Tag incident ».
 */
export function macroActionsSummary(
  actions: ActionLike[],
  teamNameById?: Map<string, string>,
): string {
  const parts = actions.map((a) => {
    switch (a.type) {
      case "insert_text":
        return "Insérer un texte";
      case "insert_note":
        return "Note interne";
      case "set_status": {
        const opt = FIELD_VALUE_OPTIONS.status?.find((o) => o.value === a.value);
        return `Statut → ${opt?.label ?? a.value}`;
      }
      case "set_priority": {
        const opt = FIELD_VALUE_OPTIONS.priority?.find((o) => o.value === a.value);
        return `Priorité → ${opt?.label ?? a.value}`;
      }
      case "assign_team":
        return `Équipe → ${teamNameById?.get(String(a.value ?? "")) ?? "équipe"}`;
      case "assign_user":
        return "Assigner →";
      case "add_tags":
        return `Tag ${(Array.isArray(a.value) ? a.value : []).join(", ")}`;
      default:
        return String(a.type);
    }
  });
  return parts.join(" · ") || "Aucune action";
}

/** « 15 min », « 4 h », « 2 j » — affichage des cibles SLA (ST-07). */
export function formatDurationFr(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} j`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Parse « 15 min » / « 4 h » / « 2 j » (aussi « 90 » = minutes) → minutes, ou null. */
export function parseDurationFr(raw: string): number | null {
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
