/**
 * Défauts installés dans TOUT nouveau workspace — contenus imaginés par le design
 * (design-notes/administration.md) : horaires ouvrés, équipes, politiques SLA,
 * macros, règles d'automatisation, champs & formulaires.
 * Idempotent : ne réinstalle pas si des horaires ouvrés existent déjà pour le tenant.
 */
import { eq } from "drizzle-orm";
import { db } from "../client";
import {
  automationRules,
  businessHours,
  formFields,
  macros,
  slaPolicies,
  teams,
  ticketFields,
  ticketForms,
} from "../schema";

const WEEK_9_18 = {
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
};

const FRENCH_HOLIDAYS = [
  { date: "2026-01-01", label: "Jour de l'An" },
  { date: "2026-04-06", label: "Lundi de Pâques" },
  { date: "2026-05-01", label: "Fête du Travail" },
  { date: "2026-05-08", label: "Victoire 1945" },
  { date: "2026-07-14", label: "Fête nationale" },
  { date: "2026-12-25", label: "Noël" },
];

export async function installDefaults(tenantId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: businessHours.id })
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenantId))
    .limit(1);
  if (existing) return false;

  /* ---------- Horaires ouvrés ---------- */
  const [bureauFrance] = await db
    .insert(businessHours)
    .values({
      tenantId,
      name: "Bureau France 9h–18h",
      position: 0,
      timezone: "Europe/Paris",
      weeklyHours: WEEK_9_18,
      holidays: FRENCH_HOLIDAYS,
    })
    .returning();
  const [astreinte] = await db
    .insert(businessHours)
    .values({
      tenantId,
      name: "Astreinte 24/7",
      position: 1,
      timezone: "Europe/Paris",
      weeklyHours: {},
      holidays: [],
    })
    .returning();
  await db.insert(businessHours).values({
    tenantId,
    name: "Support Benelux",
    position: 2,
    timezone: "Europe/Brussels",
    weeklyHours: {
      mon: [["09:00", "17:30"]],
      tue: [["09:00", "17:30"]],
      wed: [["09:00", "17:30"]],
      thu: [["09:00", "17:30"]],
      fri: [["09:00", "17:30"]],
    },
    holidays: [],
  });

  /* ---------- Équipes ---------- */
  const teamRows = await db
    .insert(teams)
    .values([
      { tenantId, name: "Support N1", businessHoursId: bureauFrance!.id },
      { tenantId, name: "Escalade", businessHoursId: astreinte!.id },
      { tenantId, name: "Commercial", businessHoursId: bureauFrance!.id },
      { tenantId, name: "Produit", businessHoursId: bureauFrance!.id },
    ])
    .returning();
  const teamId = (name: string) => teamRows.find((t) => t.name === name)!.id;

  /* ---------- Politiques SLA (l'ordre compte — la première qui matche s'applique) ---------- */
  await db.insert(slaPolicies).values([
    {
      tenantId,
      name: "Clients Premium",
      position: 0,
      // Adaptation : le design cible « Organisation a le tag premium » ; porté par le
      // tag de ticket « premium » tant que les organisations n'ont pas de tags.
      conditions: [{ field: "tags", operator: "includes", value: "premium" }],
      targets: {
        urgent: { firstReplyMin: 15, nextReplyMin: 30, resolveMin: 240 },
        high: { firstReplyMin: 60, nextReplyMin: 120, resolveMin: 480 },
        normal: { firstReplyMin: 240, nextReplyMin: 480, resolveMin: 2880 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: astreinte!.id,
    },
    {
      tenantId,
      name: "Incidents production",
      position: 1,
      conditions: [{ field: "type", operator: "is", value: "Incident" }],
      targets: {
        urgent: { firstReplyMin: 30, nextReplyMin: 60, resolveMin: 480 },
        high: { firstReplyMin: 120, nextReplyMin: 240, resolveMin: 960 },
        normal: { firstReplyMin: 480, nextReplyMin: 960, resolveMin: 4320 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: astreinte!.id,
    },
    {
      tenantId,
      name: "Politique par défaut",
      position: 2,
      isDefault: true,
      conditions: [],
      targets: {
        urgent: { firstReplyMin: 60, nextReplyMin: 120, resolveMin: 480 },
        high: { firstReplyMin: 240, nextReplyMin: 480, resolveMin: 1440 },
        normal: { firstReplyMin: 480, nextReplyMin: 960, resolveMin: 4320 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: bureauFrance!.id,
    },
  ]);

  /* ---------- Macros (7, en 3 catégories — textes du design) ---------- */
  await db.insert(macros).values([
    {
      tenantId,
      name: "Accusé de réception",
      category: "Réponses courantes",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.prenom}}, nous avons bien reçu votre demande et " +
            "revenons vers vous sous 4 heures ouvrées.",
        },
        { type: "set_status", value: "open" },
      ],
    },
    {
      tenantId,
      name: "Demande de précisions",
      category: "Réponses courantes",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.prenom}}, pour avancer sur votre demande, pourriez-vous " +
            "préciser les étapes exactes qui mènent au problème, et joindre une capture " +
            "d'écran si possible ? Merci !",
        },
        { type: "set_status", value: "waiting" },
      ],
    },
    {
      tenantId,
      name: "Résolution confirmée",
      category: "Réponses courantes",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.prenom}}, le problème est résolu de notre côté. " +
            "N'hésitez pas à répondre à cet email si quelque chose ne fonctionne pas " +
            "comme attendu — la demande sera rouverte automatiquement.",
        },
        { type: "set_status", value: "resolved" },
      ],
    },
    {
      tenantId,
      name: "Transfert niveau 2",
      category: "Escalade",
      availability: "team",
      teamId: teamId("Support N1"),
      actions: [
        {
          type: "insert_note",
          value:
            "Transfert au niveau 2 : diagnostic N1 effectué, voir les échanges " +
            "ci-dessus. Merci de reprendre la main.",
        },
        { type: "assign_team", value: teamId("Escalade") },
        { type: "set_priority", value: "high" },
      ],
    },
    {
      tenantId,
      name: "Incident majeur",
      category: "Escalade",
      availability: "team",
      teamId: teamId("Escalade"),
      actions: [
        {
          type: "insert_note",
          value:
            "Incident majeur déclaré : impact multi-clients suspecté. Prévenir le " +
            "responsable d'astreinte et ouvrir un canal dédié.",
        },
        { type: "set_priority", value: "urgent" },
        { type: "add_tags", value: ["incident"] },
      ],
    },
    {
      tenantId,
      name: "Envoi de facture",
      category: "Facturation",
      availability: "team",
      teamId: teamId("Commercial"),
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.nom}}, vous trouverez la facture demandée en pièce " +
            "jointe. Elle reste disponible à tout moment depuis votre espace client, " +
            "rubrique Abonnement.",
        },
        { type: "add_tags", value: ["facturation"] },
      ],
    },
    {
      tenantId,
      name: "Remboursement accordé",
      category: "Facturation",
      availability: "team",
      teamId: teamId("Commercial"),
      actions: [
        {
          type: "insert_text",
          value:
            "Bonjour {{contact.prenom}}, votre demande de remboursement est acceptée. " +
            "Le montant sera recrédité sur votre moyen de paiement sous 5 à 10 jours " +
            "ouvrés.",
        },
        { type: "set_status", value: "resolved" },
      ],
    },
  ]);

  /* ---------- Automatisations (5 — Round-robin livrée désactivée, comme le design) ---------- */
  await db.insert(automationRules).values([
    {
      tenantId,
      kind: "trigger",
      name: "Accusé de réception",
      position: 0,
      active: true,
      conditionsAll: [{ field: "event", operator: "is", value: "ticket.created" }],
      actions: [
        {
          type: "email_contact",
          value:
            "Bonjour {{contact.name}},\n\nNous avons bien reçu votre demande " +
            "« {{ticket.subject}} » (ticket #{{ticket.number}}) et revenons vers vous " +
            "sous 4 heures ouvrées.\n\nL'équipe support",
        },
      ],
    },
    {
      tenantId,
      kind: "trigger",
      name: "Escalade urgente",
      position: 1,
      active: true,
      conditionsAll: [{ field: "priority", operator: "is", value: "urgent" }],
      actions: [{ type: "assign_team", value: teamId("Escalade") }],
    },
    {
      tenantId,
      kind: "trigger",
      name: "Round-robin Support N1",
      position: 2,
      active: false,
      conditionsAll: [
        { field: "team", operator: "is", value: teamId("Support N1") },
        { field: "assignee", operator: "empty" },
      ],
      actions: [{ type: "assign_round_robin" }],
    },
    {
      tenantId,
      kind: "scheduled",
      name: "Relance client à 48 h",
      position: 0,
      active: true,
      conditionsAll: [
        { field: "status", operator: "is", value: "waiting" },
        { field: "hours_since_updated", operator: "gte", value: 48 },
      ],
      actions: [
        {
          type: "email_contact",
          value:
            "Bonjour {{contact.name}},\n\nNous attendons votre retour sur la demande " +
            "« {{ticket.subject}} » (#{{ticket.number}}). Sans réponse de votre part, " +
            "elle sera résolue automatiquement dans quelques jours.\n\nL'équipe support",
        },
      ],
    },
    {
      tenantId,
      kind: "scheduled",
      name: "Clôture automatique J+4",
      position: 1,
      active: true,
      conditionsAll: [
        { field: "status", operator: "is", value: "resolved" },
        { field: "hours_since_updated", operator: "gte", value: 96 },
      ],
      actions: [{ type: "set_status", value: "closed" }],
    },
  ]);

  /* ---------- Champs & formulaires ---------- */
  const fieldRows = await db
    .insert(ticketFields)
    .values([
      {
        tenantId,
        key: "module",
        label: "Module concerné",
        type: "select",
        options: ["Facturation", "Compte & accès", "Exports", "Intégrations", "Autre"],
        portalVisible: true,
        required: true,
        position: 0,
      },
      {
        tenantId,
        key: "urgence",
        label: "Urgence",
        type: "select",
        options: ["Basse", "Normale", "Haute"],
        portalVisible: true,
        required: false,
        position: 1,
      },
      {
        tenantId,
        key: "version",
        label: "Version du produit",
        type: "text",
        portalVisible: false,
        position: 2,
      },
      {
        tenantId,
        key: "numero_commande",
        label: "Numéro de commande",
        type: "number",
        portalVisible: true,
        position: 3,
      },
      {
        tenantId,
        key: "date_souhaitee",
        label: "Date souhaitée",
        type: "date",
        portalVisible: true,
        position: 4,
      },
      {
        tenantId,
        key: "environnement",
        label: "Environnement",
        type: "multi_select",
        options: ["Production", "Préproduction", "Développement"],
        portalVisible: false,
        position: 5,
      },
      {
        tenantId,
        key: "contrat_support",
        label: "Contrat de support",
        type: "checkbox",
        portalVisible: false,
        position: 6,
      },
    ])
    .returning();
  const fieldId = (key: string) => fieldRows.find((f) => f.key === key)!.id;

  const formRows = await db
    .insert(ticketForms)
    .values([
      { tenantId, name: "Support général", portalVisible: true, position: 0 },
      { tenantId, name: "Facturation", portalVisible: true, position: 1 },
      { tenantId, name: "Commercial", portalVisible: false, position: 2 },
    ])
    .returning();
  const formId = (name: string) => formRows.find((f) => f.name === name)!.id;

  await db.insert(formFields).values([
    { tenantId, formId: formId("Support général"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("Support général"), fieldId: fieldId("urgence"), position: 1 },
    { tenantId, formId: formId("Support général"), fieldId: fieldId("version"), position: 2 },
    { tenantId, formId: formId("Support général"), fieldId: fieldId("environnement"), position: 3 },
    { tenantId, formId: formId("Facturation"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("Facturation"), fieldId: fieldId("numero_commande"), position: 1 },
    { tenantId, formId: formId("Facturation"), fieldId: fieldId("urgence"), position: 2 },
    { tenantId, formId: formId("Commercial"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("Commercial"), fieldId: fieldId("date_souhaitee"), position: 1 },
    { tenantId, formId: formId("Commercial"), fieldId: fieldId("contrat_support"), position: 2 },
  ]);

  return true;
}
