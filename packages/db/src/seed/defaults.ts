/**
 * Defaults installed in EVERY new workspace: business hours, teams, SLA
 * policies, macros, automation rules, fields & forms. Example content, meant to
 * be edited — it exists so a fresh install has something to look at.
 * Idempotent: does not reinstall if business hours already exist for the tenant.
 */
import { eq } from "drizzle-orm";
import { db } from "../client";
import { seedText } from "./defaults-i18n";
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

/**
 * An example calendar, deliberately not a country's own: enough days to show
 * the feature, each of them observed across most of Europe. An administrator
 * replaces them with the ones their team actually takes (ST-07).
 */
const EXAMPLE_HOLIDAYS: [string, string][] = [
  ["2026-01-01", "hol.newYear"],
  ["2026-04-06", "hol.easterMonday"],
  ["2026-05-01", "hol.labour"],
  ["2026-12-25", "hol.christmas"],
];

export async function installDefaults(tenantId: string, locale = "en"): Promise<boolean> {
  /** The example content, in the workspace's language. */
  const T = (key: string) => seedText(key, locale);

  const [existing] = await db
    .select({ id: businessHours.id })
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenantId))
    .limit(1);
  if (existing) return false;

  /* ---------- Business hours ---------- */
  const [mainOffice] = await db
    .insert(businessHours)
    .values({
      tenantId,
      name: T("cal.main"),
      position: 0,
      timezone: "UTC",
      weeklyHours: WEEK_9_18,
      holidays: EXAMPLE_HOLIDAYS.map(([date, key]) => ({ date, label: T(key) })),
    })
    .returning();
  const [onCall] = await db
    .insert(businessHours)
    .values({
      tenantId,
      name: T("cal.oncall"),
      position: 1,
      timezone: "UTC",
      weeklyHours: {},
      holidays: [],
    })
    .returning();
  await db.insert(businessHours).values({
    tenantId,
    name: T("cal.europe"),
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

  /* ---------- Teams ---------- */
  const teamRows = await db
    .insert(teams)
    .values([
      { tenantId, name: T("team.tier1"), businessHoursId: mainOffice!.id },
      { tenantId, name: T("team.escalation"), businessHoursId: onCall!.id },
      { tenantId, name: T("team.sales"), businessHoursId: mainOffice!.id },
      { tenantId, name: T("team.product"), businessHoursId: mainOffice!.id },
    ])
    .returning();
  /* Looked up by rank, not by name: the names are translated, and matching on
     "Tier 1" stopped finding anything the day a workspace was created in
     another language. */
  const TEAM_ORDER = ["tier1", "escalation", "sales", "product"] as const;
  const teamId = (slug: (typeof TEAM_ORDER)[number]) =>
    teamRows[TEAM_ORDER.indexOf(slug)]!.id;

  /* ---------- SLA policies (order matters — the first match wins) ---------- */
  await db.insert(slaPolicies).values([
    {
      tenantId,
      name: T("sla.premium"),
      position: 0,
      // Carried by the "premium" ticket tag as long as organizations have no tags.
      conditions: [{ field: "tags", operator: "includes", value: "premium" }],
      targets: {
        urgent: { firstReplyMin: 15, nextReplyMin: 30, resolveMin: 240 },
        high: { firstReplyMin: 60, nextReplyMin: 120, resolveMin: 480 },
        normal: { firstReplyMin: 240, nextReplyMin: 480, resolveMin: 2880 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: onCall!.id,
    },
    {
      tenantId,
      name: T("sla.incidents"),
      position: 1,
      conditions: [{ field: "type", operator: "is", value: "Incident" }],
      targets: {
        urgent: { firstReplyMin: 30, nextReplyMin: 60, resolveMin: 480 },
        high: { firstReplyMin: 120, nextReplyMin: 240, resolveMin: 960 },
        normal: { firstReplyMin: 480, nextReplyMin: 960, resolveMin: 4320 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: onCall!.id,
    },
    {
      tenantId,
      name: T("sla.default"),
      position: 2,
      isDefault: true,
      conditions: [],
      targets: {
        urgent: { firstReplyMin: 60, nextReplyMin: 120, resolveMin: 480 },
        high: { firstReplyMin: 240, nextReplyMin: 480, resolveMin: 1440 },
        normal: { firstReplyMin: 480, nextReplyMin: 960, resolveMin: 4320 },
        low: { firstReplyMin: 1440, nextReplyMin: 2880, resolveMin: 7200 },
      },
      businessHoursId: mainOffice!.id,
    },
  ]);

  /* ---------- Macros (7, in 3 categories) ---------- */
  await db.insert(macros).values([
    {
      tenantId,
      name: T("macro.ack"),
      category: T("macroCat.common"),
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value: T("macroText.ack"),
        },
        { type: "set_status", value: "open" },
      ],
    },
    {
      tenantId,
      name: T("macro.details"),
      category: T("macroCat.common"),
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value: T("macroText.details"),
        },
        { type: "set_status", value: "waiting" },
      ],
    },
    {
      tenantId,
      name: T("macro.resolved"),
      category: T("macroCat.common"),
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value: T("macroText.resolved"),
        },
        { type: "set_status", value: "resolved" },
      ],
    },
    {
      tenantId,
      name: T("macro.escalate"),
      category: T("team.escalation"),
      availability: "team",
      teamId: teamId("tier1"),
      actions: [
        {
          type: "insert_note",
          value: T("macroText.escalate"),
        },
        { type: "assign_team", value: teamId("escalation") },
        { type: "set_priority", value: "high" },
      ],
    },
    {
      tenantId,
      name: T("macro.major"),
      category: T("team.escalation"),
      availability: "team",
      teamId: teamId("escalation"),
      actions: [
        {
          type: "insert_note",
          value: T("macroText.major"),
        },
        { type: "set_priority", value: "urgent" },
        { type: "add_tags", value: ["incident"] },
      ],
    },
    {
      tenantId,
      name: T("macro.invoice"),
      category: T("macroCat.billing"),
      availability: "team",
      teamId: teamId("sales"),
      actions: [
        {
          type: "insert_text",
          value: T("macroText.invoice"),
        },
        { type: "add_tags", value: ["billing"] },
      ],
    },
    {
      tenantId,
      name: T("macro.refund"),
      category: T("macroCat.billing"),
      availability: "team",
      teamId: teamId("sales"),
      actions: [
        {
          type: "insert_text",
          value: T("macroText.refund"),
        },
        { type: "set_status", value: "resolved" },
      ],
    },
  ]);

  /* ---------- Automations (5 — round-robin ships disabled) ---------- */
  await db.insert(automationRules).values([
    {
      tenantId,
      kind: "trigger",
      name: T("rule.ack"),
      position: 0,
      active: true,
      conditionsAll: [{ field: "event", operator: "is", value: "ticket.created" }],
      actions: [
        {
          type: "email_contact",
          value: T("ruleText.ack"),
        },
      ],
    },
    {
      tenantId,
      kind: "trigger",
      name: T("rule.urgent"),
      position: 1,
      active: true,
      conditionsAll: [{ field: "priority", operator: "is", value: "urgent" }],
      actions: [{ type: "assign_team", value: teamId("escalation") }],
    },
    {
      tenantId,
      kind: "trigger",
      name: T("rule.roundRobin"),
      position: 2,
      active: false,
      conditionsAll: [
        { field: "team", operator: "is", value: teamId("tier1") },
        { field: "assignee", operator: "empty" },
      ],
      actions: [{ type: "assign_round_robin" }],
    },
    {
      tenantId,
      kind: "scheduled",
      name: T("rule.reminder"),
      position: 3,
      active: true,
      conditionsAll: [
        { field: "status", operator: "is", value: "waiting" },
        { field: "hours_since_updated", operator: "gte", value: 48 },
      ],
      actions: [
        {
          type: "email_contact",
          value: T("ruleText.reminder"),
        },
      ],
    },
    {
      tenantId,
      kind: "scheduled",
      name: T("rule.autoclose"),
      position: 4,
      active: true,
      conditionsAll: [
        { field: "status", operator: "is", value: "resolved" },
        { field: "hours_since_updated", operator: "gte", value: 96 },
      ],
      actions: [{ type: "set_status", value: "closed" }],
    },
  ]);

  /* ---------- Fields & forms ---------- */
  const fieldRows = await db
    .insert(ticketFields)
    .values([
      {
        tenantId,
        key: "module",
        label: T("field.module"),
        type: "select",
        options: [
          T("macroCat.billing"),
          T("opt.module.account"),
          T("opt.module.exports"),
          T("opt.module.integrations"),
          T("opt.module.other"),
        ],
        portalVisible: true,
        required: true,
        position: 0,
      },
      {
        tenantId,
        key: "urgency",
        label: T("field.urgency"),
        type: "select",
        options: [T("opt.urgency.low"), T("opt.urgency.normal"), T("opt.urgency.high")],
        portalVisible: true,
        required: false,
        position: 1,
      },
      {
        tenantId,
        key: "version",
        label: T("field.version"),
        type: "text",
        portalVisible: false,
        position: 2,
      },
      {
        tenantId,
        key: "order_number",
        label: T("field.orderNumber"),
        type: "number",
        portalVisible: true,
        position: 3,
      },
      {
        tenantId,
        key: "preferred_date",
        label: T("field.preferredDate"),
        type: "date",
        portalVisible: true,
        position: 4,
      },
      {
        tenantId,
        key: "environment",
        label: T("field.environment"),
        type: "multi_select",
        options: [T("opt.env.production"), T("opt.env.staging"), T("opt.env.development")],
        portalVisible: false,
        position: 5,
      },
      {
        tenantId,
        key: "support_contract",
        label: T("field.supportContract"),
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
      { tenantId, name: T("form.general"), portalVisible: true, position: 0 },
      { tenantId, name: T("macroCat.billing"), portalVisible: true, position: 1 },
      { tenantId, name: T("team.sales"), portalVisible: false, position: 2 },
    ])
    .returning();
  /* By rank, like the teams: the names are translated. */
  const FORM_ORDER = ["general", "billing", "sales"] as const;
  const formId = (slug: (typeof FORM_ORDER)[number]) => formRows[FORM_ORDER.indexOf(slug)]!.id;

  await db.insert(formFields).values([
    { tenantId, formId: formId("general"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("general"), fieldId: fieldId("urgency"), position: 1 },
    { tenantId, formId: formId("general"), fieldId: fieldId("version"), position: 2 },
    { tenantId, formId: formId("general"), fieldId: fieldId("environment"), position: 3 },
    { tenantId, formId: formId("billing"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("billing"), fieldId: fieldId("order_number"), position: 1 },
    { tenantId, formId: formId("billing"), fieldId: fieldId("urgency"), position: 2 },
    { tenantId, formId: formId("sales"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("sales"), fieldId: fieldId("preferred_date"), position: 1 },
    { tenantId, formId: formId("sales"), fieldId: fieldId("support_contract"), position: 2 },
  ]);

  return true;
}
