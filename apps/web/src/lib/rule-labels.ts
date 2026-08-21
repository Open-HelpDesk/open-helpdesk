/**
 * Vocabulaire du moteur de règles — partagé par le builder (ST-05), les résumés
 * lisibles des listes, l'éditeur SLA (ST-07) et les macros (ST-06).
 *
 * Ce fichier ne portait que du français : des tables de libellés et deux
 * fabricants de phrases qui les assemblaient par concaténation. Tout l'écran des
 * automatisations restait donc en français dans un workspace réglé en bulgare.
 *
 * Il porte maintenant des CLÉS, comme `lib/format.ts` : le rendu passe par `t()`,
 * qui connaît la langue du tenant. Les deux fabricants de phrases reçoivent donc
 * `t`, et leurs gabarits sont eux-mêmes des clés — « Si {conditions} alors
 * {actions} » n'a pas le même ordre de mots partout.
 *
 * Reste client-safe : rien ici n'importe de code serveur.
 */
import type { MessageKey } from "@/i18n/dictionaries/fr";
import { CHANNEL_KEYS, PRIORITY_KEYS, STATUS_KEYS } from "@/lib/format";

/** Ce dont les fabricants de phrases ont besoin : traduire. */
type Tr = {
  (key: MessageKey, params?: Record<string, string | number>): string;
};

/** Champs sur lesquels une condition peut porter (ordre du menu de ST-05). */
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
 * Opérateurs. Les deux comparaisons numériques valent un symbole en français,
 * mais elles passent par le dictionnaire comme les autres : une langue qui
 * préférerait un mot doit pouvoir le dire, et une table à deux régimes serait un
 * piège pour la prochaine.
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
 * Valeurs proposées par champ (select) ; les autres champs sont en saisie libre.
 *
 * Statuts, priorités et canaux viennent des tables partagées de `lib/format.ts`
 * plutôt que d'un jeu de clés propre : ce sont les mêmes libellés que ceux de
 * l'inbox et de ses filtres, et deux jeux finiraient par diverger.
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

/** Types de champs personnalisés (ST-04). */
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
 * Une condition, en une bribe de phrase.
 *
 * Un écart assumé par rapport à la maquette française : les noms de champ ne
 * sont plus mis en minuscules. `toLowerCase()` est faux dès qu'une langue
 * capitalise ses substantifs — l'allemand écrit « Priorität », pas
 * « priorität » — et fournir un second jeu de douze libellés en minuscules pour
 * une différence de casse aurait coûté plus que cela ne rapporte.
 */
function conditionText(t: Tr, c: ConditionLike, teamNames?: Map<string, string>): string {
  // L'événement se lit seul, sans nom de champ.
  if (c.field === "event") return valueLabel(t, c);
  // « non assigné » plutôt que « Assigné est vide ».
  if (c.field === "assignee" && c.operator === "empty") {
    return t("app.settings.rules.summaryUnassigned");
  }
  if (c.field === "assignee" && c.operator === "not_empty") {
    return t("app.settings.rules.summaryAssigned");
  }
  // Ancienneté. La durée reste dans les jetons du parseur : voir
  // formatDurationTokens, en bas de ce fichier.
  if (DURATION_FIELDS.has(c.field)) {
    const hours = Number(c.value ?? 0);
    const duration = hours >= 24 && hours % 24 === 0 ? `${hours / 24} j` : `${hours} h`;
    return t("app.settings.rules.summarySince", { duration });
  }
  const cleChamp = FIELD_KEYS[c.field];
  const field = cleChamp ? t(cleChamp) : c.field;
  const cleOp = OPERATOR_KEYS[c.operator];
  if (VALUELESS_OPERATORS.has(c.operator)) {
    return t("app.settings.rules.summaryConditionNoValue", {
      field,
      operator: cleOp ? t(cleOp) : c.operator,
    });
  }
  // Le résumé abrège « est » en signe égal : c'est un symbole, il ne se traduit
  // pas, et il tient dans une ligne de liste là où le mot ne tiendrait pas.
  const operator = c.operator === "is" ? "=" : cleOp ? t(cleOp) : c.operator;
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
      const cle = ACTION_KEYS[a.type];
      return cle ? t(cle) : a.type;
    }
  }
}

/**
 * Les conditions d'une règle, sans les actions.
 *
 * Exposé parce que l'éditeur SLA n'affiche que cette moitié : il fabriquait la
 * phrase entière puis en retirait le début et la fin — `.replace(/^Si /, "")`
 * suivi de `.replace(" → aucune action", "")`. Deux tournures françaises, qui ne
 * retiraient plus rien dès que le workspace changeait de langue et laissaient
 * la phrase complète dans une colonne de tableau.
 */
export function conditionsSummary(
  t: Tr,
  conditionsAll: ConditionLike[],
  conditionsAny: ConditionLike[],
  teamNames?: Map<string, string>,
): string {
  const bribes: { texte: string; duree: boolean }[] = conditionsAll.map((c) => ({
    texte: conditionText(t, c, teamNames),
    duree: DURATION_FIELDS.has(c.field),
  }));
  if (conditionsAny.length > 0) {
    bribes.push({
      texte: t("app.settings.rules.summaryAnyOf", { count: conditionsAny.length }),
      duree: false,
    });
  }
  // Une ancienneté complète la condition qui la précède plutôt que de compter
  // pour une condition de plus : « statut = En attente depuis 2 j ». Le
  // rattachement se décide sur le CHAMP, pas sur le texte rendu — chercher un
  // « depuis » dans la traduction supposerait que toutes les langues placent ce
  // mot en tête, ce que le hongrois et le finnois ne font pas.
  const parts = bribes.reduce<string[]>((acc, b) => {
    if (b.duree && acc.length > 0) {
      acc[acc.length - 1] = `${acc[acc.length - 1]} ${b.texte}`;
      return acc;
    }
    acc.push(b.texte);
    return acc;
  }, []);
  return parts.join(` ${t("app.settings.rules.summaryAnd")} `) ||
    t("app.settings.rules.summaryAlways");
}

/**
 * Les actions d'une règle, sans les conditions.
 *
 * Exposé parce que l'écran de test des règles n'a besoin que de cette moitié :
 * il fabriquait la phrase entière puis en retirait le début avec
 * `.replace(/^Si toujours → /, "")` — une expression française, qui ne retirait
 * plus rien dès que le workspace changeait de langue et laissait « Si toujours »
 * en tête du message de test.
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
 * Résumé lisible d'une règle, au style du design : une ligne de liste, plus
 * courte que le formulaire du builder.
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

/** Résumé des actions d'une macro (ST-06), en une ligne de liste. */
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
 * Durées SLA — une SYNTAXE, pas un libellé
 *
 * Ces deux fonctions s'appelaient `formatDurationFr` / `parseDurationFr`, ce qui
 * laissait croire à du français à traduire. C'est le contraire : la valeur
 * produite est réinjectée comme valeur par défaut du champ de saisie de ST-07,
 * et relue par le parseur au prochain enregistrement. Les jetons min, h et j
 * sont donc un format d'échange, identique dans toutes les langues — les
 * traduire empêcherait purement et simplement d'enregistrer. C'est pour cela que
 * l'aide du champ les cite et les glose au lieu de les remplacer.
 * ------------------------------------------------------------------------- */

/** « 15 min », « 4 h », « 2 j » — jetons du parseur, jamais traduits. */
export function formatDurationTokens(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} j`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

/** Parse « 15 min » / « 4 h » / « 2 j » (aussi « 90 » = minutes) vers des minutes. */
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
