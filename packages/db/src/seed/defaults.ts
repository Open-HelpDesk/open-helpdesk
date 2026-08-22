/**
 * Defaults installed in EVERY new workspace: business hours, teams, SLA
 * policies, macros, automation rules, fields & forms. Example content, meant to
 * be edited — it exists so a fresh install has something to look at.
 * Idempotent: does not reinstall if business hours already exist for the tenant.
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

/**
 * An example calendar, deliberately not a country's own: enough days to show
 * the feature, each of them observed across most of Europe. An administrator
 * replaces them with the ones their team actually takes (ST-07).
 */
const EXAMPLE_HOLIDAYS = [
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-04-06", label: "Easter Monday" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-12-25", label: "Christmas Day" },
];

export async function installDefaults(tenantId: string): Promise<boolean> {
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
      name: "Main office 9–18",
      position: 0,
      timezone: "UTC",
      weeklyHours: WEEK_9_18,
      holidays: EXAMPLE_HOLIDAYS,
    })
    .returning();
  const [onCall] = await db
    .insert(businessHours)
    .values({
      tenantId,
      name: "On-call 24/7",
      position: 1,
      timezone: "UTC",
      weeklyHours: {},
      holidays: [],
    })
    .returning();
  await db.insert(businessHours).values({
    tenantId,
    name: "European office 9–17:30",
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
      { tenantId, name: "Tier 1", businessHoursId: mainOffice!.id },
      { tenantId, name: "Escalation", businessHoursId: onCall!.id },
      { tenantId, name: "Sales", businessHoursId: mainOffice!.id },
      { tenantId, name: "Product", businessHoursId: mainOffice!.id },
    ])
    .returning();
  const teamId = (name: string) => teamRows.find((t) => t.name === name)!.id;

  /* ---------- SLA policies (order matters — the first match wins) ---------- */
  await db.insert(slaPolicies).values([
    {
      tenantId,
      name: "Premium customers",
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
      name: "Production incidents",
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
      name: "Default policy",
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
      name: "Acknowledgement",
      category: "Common replies",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Hello {{contact.name}}, we have received your request and will get " +
            "back to you within 4 business hours.",
        },
        { type: "set_status", value: "open" },
      ],
    },
    {
      tenantId,
      name: "Request for details",
      category: "Common replies",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Hello {{contact.name}}, to move your request forward, could you spell out " +
            "the exact steps that lead to the problem, and attach a screenshot if you " +
            "have one? Thank you!",
        },
        { type: "set_status", value: "waiting" },
      ],
    },
    {
      tenantId,
      name: "Resolution confirmed",
      category: "Common replies",
      availability: "everyone",
      actions: [
        {
          type: "insert_text",
          value:
            "Hello {{contact.name}}, the problem is fixed on our side. Do reply to " +
            "this email if anything still does not work as expected — the request " +
            "will be reopened automatically.",
        },
        { type: "set_status", value: "resolved" },
      ],
    },
    {
      tenantId,
      name: "Escalate to tier 2",
      category: "Escalation",
      availability: "team",
      teamId: teamId("Tier 1"),
      actions: [
        {
          type: "insert_note",
          value:
            "Escalated to tier 2: tier 1 diagnosis done, see the exchanges above. " +
            "Please take over.",
        },
        { type: "assign_team", value: teamId("Escalation") },
        { type: "set_priority", value: "high" },
      ],
    },
    {
      tenantId,
      name: "Major incident",
      category: "Escalation",
      availability: "team",
      teamId: teamId("Escalation"),
      actions: [
        {
          type: "insert_note",
          value:
            "Major incident declared: several customers are likely affected. Alert " +
            "the on-call lead and open a dedicated channel.",
        },
        { type: "set_priority", value: "urgent" },
        { type: "add_tags", value: ["incident"] },
      ],
    },
    {
      tenantId,
      name: "Send an invoice",
      category: "Billing",
      availability: "team",
      teamId: teamId("Sales"),
      actions: [
        {
          type: "insert_text",
          value:
            "Hello {{contact.name}}, the invoice you asked for is attached. It also " +
            "stays available at any time from your customer area.",
        },
        { type: "add_tags", value: ["billing"] },
      ],
    },
    {
      tenantId,
      name: "Refund approved",
      category: "Billing",
      availability: "team",
      teamId: teamId("Sales"),
      actions: [
        {
          type: "insert_text",
          value:
            "Hello {{contact.name}}, your refund request is approved. The amount will " +
            "be credited back to your payment method within 5 to 10 business days.",
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
      name: "Acknowledge receipt",
      position: 0,
      active: true,
      conditionsAll: [{ field: "event", operator: "is", value: "ticket.created" }],
      actions: [
        {
          type: "email_contact",
          value:
            "Hello {{contact.name}},\n\nWe have received your request " +
            "“{{ticket.subject}}” (ticket #{{ticket.number}}) and will get back to " +
            "you within 4 business hours.\n\nThe support team",
        },
      ],
    },
    {
      tenantId,
      kind: "trigger",
      name: "Urgent escalation",
      position: 1,
      active: true,
      conditionsAll: [{ field: "priority", operator: "is", value: "urgent" }],
      actions: [{ type: "assign_team", value: teamId("Escalation") }],
    },
    {
      tenantId,
      kind: "trigger",
      name: "Round-robin tier 1",
      position: 2,
      active: false,
      conditionsAll: [
        { field: "team", operator: "is", value: teamId("Tier 1") },
        { field: "assignee", operator: "empty" },
      ],
      actions: [{ type: "assign_round_robin" }],
    },
    {
      tenantId,
      kind: "scheduled",
      name: "Customer reminder after 48 h",
      position: 3,
      active: true,
      conditionsAll: [
        { field: "status", operator: "is", value: "waiting" },
        { field: "hours_since_updated", operator: "gte", value: 48 },
      ],
      actions: [
        {
          type: "email_contact",
          value:
            "Hello {{contact.name}},\n\nWe are still waiting for your reply on the " +
            "request “{{ticket.subject}}” (#{{ticket.number}}). Without an answer from " +
            "you, it will be resolved automatically in a few days.\n\nThe support team",
        },
      ],
    },
    {
      tenantId,
      kind: "scheduled",
      name: "Auto-close after 4 days",
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
        label: "Module concerned",
        type: "select",
        options: ["Billing", "Account & access", "Exports", "Integrations", "Other"],
        portalVisible: true,
        required: true,
        position: 0,
      },
      {
        tenantId,
        key: "urgency",
        label: "Urgency",
        type: "select",
        options: ["Low", "Normal", "High"],
        portalVisible: true,
        required: false,
        position: 1,
      },
      {
        tenantId,
        key: "version",
        label: "Product version",
        type: "text",
        portalVisible: false,
        position: 2,
      },
      {
        tenantId,
        key: "order_number",
        label: "Order number",
        type: "number",
        portalVisible: true,
        position: 3,
      },
      {
        tenantId,
        key: "preferred_date",
        label: "Preferred date",
        type: "date",
        portalVisible: true,
        position: 4,
      },
      {
        tenantId,
        key: "environment",
        label: "Environment",
        type: "multi_select",
        options: ["Production", "Staging", "Development"],
        portalVisible: false,
        position: 5,
      },
      {
        tenantId,
        key: "support_contract",
        label: "Support contract",
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
      { tenantId, name: "General support", portalVisible: true, position: 0 },
      { tenantId, name: "Billing", portalVisible: true, position: 1 },
      { tenantId, name: "Sales", portalVisible: false, position: 2 },
    ])
    .returning();
  const formId = (name: string) => formRows.find((f) => f.name === name)!.id;

  await db.insert(formFields).values([
    { tenantId, formId: formId("General support"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("General support"), fieldId: fieldId("urgency"), position: 1 },
    { tenantId, formId: formId("General support"), fieldId: fieldId("version"), position: 2 },
    { tenantId, formId: formId("General support"), fieldId: fieldId("environment"), position: 3 },
    { tenantId, formId: formId("Billing"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("Billing"), fieldId: fieldId("order_number"), position: 1 },
    { tenantId, formId: formId("Billing"), fieldId: fieldId("urgency"), position: 2 },
    { tenantId, formId: formId("Sales"), fieldId: fieldId("module"), position: 0 },
    { tenantId, formId: formId("Sales"), fieldId: fieldId("preferred_date"), position: 1 },
    { tenantId, formId: formId("Sales"), fieldId: fieldId("support_contract"), position: 2 },
  ]);

  return true;
}
