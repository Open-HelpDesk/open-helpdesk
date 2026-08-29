/**
 * Rewrites the example content of a workspace into its language.
 *
 * `installDefaults` writes the examples once, at creation. A workspace created
 * before its language was set — or one whose language is changed afterwards —
 * keeps calendars, teams, policies, macros and rules in the previous language,
 * which is what an administrator sees on the SLA, macros and automation
 * screens while the rest of the interface has already switched.
 *
 * Only rows that STILL CARRY a known default are touched: the current value has
 * to match one of the 25 translations of that seeded string. Anything an
 * administrator has renamed no longer matches and is left exactly as it is —
 * this is not a translation service for user data, it only finishes a job the
 * seed could not do at the time.
 */
import { eq } from "drizzle-orm";
import { db } from "../client";
import {
  automationRules,
  businessHours,
  macros,
  slaPolicies,
  teams,
  tenants,
  ticketFields,
  ticketForms,
} from "../schema";
import { SEED_TEXT, seedText } from "./defaults-i18n";

/** Every language's version of a seeded string — what "untouched" means. */
function knownForms(key: string): Set<string> {
  return new Set(Object.values(SEED_TEXT[key] ?? {}));
}

/** The seeded key this value came from, or null if it was renamed. */
function keyOf(value: string, candidates: readonly string[]): string | null {
  for (const key of candidates) if (knownForms(key).has(value)) return key;
  return null;
}

const CALENDARS = ["cal.main", "cal.oncall", "cal.europe"] as const;
const TEAMS = ["team.tier1", "team.escalation", "team.sales", "team.product"] as const;
const POLICIES = ["sla.premium", "sla.incidents", "sla.default"] as const;
const MACROS = [
  "macro.ack",
  "macro.details",
  "macro.resolved",
  "macro.escalate",
  "macro.major",
  "macro.invoice",
  "macro.refund",
] as const;
const MACRO_CATEGORIES = ["macroCat.common", "team.escalation", "macroCat.billing"] as const;
const RULES = [
  "rule.ack",
  "rule.urgent",
  "rule.roundRobin",
  "rule.reminder",
  "rule.autoclose",
] as const;
const MACRO_TEXTS = [
  "macroText.ack",
  "macroText.details",
  "macroText.resolved",
  "macroText.escalate",
  "macroText.major",
  "macroText.invoice",
  "macroText.refund",
] as const;
const RULE_TEXTS = ["ruleText.ack", "ruleText.reminder"] as const;
const HOLIDAYS = ["hol.newYear", "hol.easterMonday", "hol.labour", "hol.christmas"] as const;
const FIELDS = [
  "field.module",
  "field.urgency",
  "field.version",
  "field.orderNumber",
  "field.preferredDate",
  "field.environment",
  "field.supportContract",
] as const;
/* "Billing" is one of the module options and also a form name — the same word,
   so the same key serves both. */
const OPTIONS = [
  "macroCat.billing",
  "opt.module.account",
  "opt.module.exports",
  "opt.module.integrations",
  "opt.module.other",
  "opt.urgency.low",
  "opt.urgency.normal",
  "opt.urgency.high",
  "opt.env.production",
  "opt.env.staging",
  "opt.env.development",
] as const;
const FORMS = ["form.general", "macroCat.billing", "team.sales"] as const;

/** Rewrites the `value` of every action still carrying a seeded text. */
function relocalizeActions(actions: unknown, locale: string): { next: unknown; changed: boolean } {
  if (!Array.isArray(actions)) return { next: actions, changed: false };
  let changed = false;
  const next = actions.map((action) => {
    const step = action as { value?: unknown };
    if (typeof step.value !== "string") return action;
    const key = keyOf(step.value, [...MACRO_TEXTS, ...RULE_TEXTS]);
    if (!key) return action;
    const translated = seedText(key, locale);
    if (translated === step.value) return action;
    changed = true;
    return { ...step, value: translated };
  });
  return { next, changed };
}

/** Returns how many rows were rewritten. */
export async function relocalizeDefaults(tenantId: string, locale: string): Promise<number> {
  let touched = 0;

  const rename = async <T extends { id: string; name: string }>(
    rows: T[],
    candidates: readonly string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one updater per table
    update: (id: string, name: string) => Promise<any>,
  ) => {
    for (const row of rows) {
      const key = keyOf(row.name, candidates);
      if (!key) continue;
      const name = seedText(key, locale);
      if (name === row.name) continue;
      await update(row.id, name);
      touched++;
    }
  };

  /* ---------- Business hours: the name, and the example holiday labels ---------- */
  const calendars = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.tenantId, tenantId));
  for (const cal of calendars) {
    const patch: { name?: string; holidays?: unknown } = {};
    const key = keyOf(cal.name, CALENDARS);
    if (key && seedText(key, locale) !== cal.name) patch.name = seedText(key, locale);

    const holidays = (cal.holidays ?? []) as { date: string; label: string }[];
    let holidaysChanged = false;
    const nextHolidays = holidays.map((holiday) => {
      const holidayKey = keyOf(holiday.label, HOLIDAYS);
      if (!holidayKey) return holiday;
      const label = seedText(holidayKey, locale);
      if (label === holiday.label) return holiday;
      holidaysChanged = true;
      return { ...holiday, label };
    });
    if (holidaysChanged) patch.holidays = nextHolidays;

    if (Object.keys(patch).length > 0) {
      await db.update(businessHours).set(patch).where(eq(businessHours.id, cal.id));
      touched++;
    }
  }

  /* ---------- Teams ---------- */
  await rename(
    await db.select().from(teams).where(eq(teams.tenantId, tenantId)),
    TEAMS,
    (id, name) => db.update(teams).set({ name }).where(eq(teams.id, id)),
  );

  /* ---------- SLA policies ---------- */
  await rename(
    await db.select().from(slaPolicies).where(eq(slaPolicies.tenantId, tenantId)),
    POLICIES,
    (id, name) => db.update(slaPolicies).set({ name }).where(eq(slaPolicies.id, id)),
  );

  /* ---------- Macros: name, category, and the text they insert ---------- */
  const macroRows = await db.select().from(macros).where(eq(macros.tenantId, tenantId));
  for (const macro of macroRows) {
    const patch: { name?: string; category?: string; actions?: unknown } = {};
    const nameKey = keyOf(macro.name, MACROS);
    if (nameKey && seedText(nameKey, locale) !== macro.name) patch.name = seedText(nameKey, locale);

    const categoryKey = macro.category ? keyOf(macro.category, MACRO_CATEGORIES) : null;
    if (categoryKey && seedText(categoryKey, locale) !== macro.category) {
      patch.category = seedText(categoryKey, locale);
    }

    const { next, changed } = relocalizeActions(macro.actions, locale);
    if (changed) patch.actions = next;

    if (Object.keys(patch).length > 0) {
      await db.update(macros).set(patch).where(eq(macros.id, macro.id));
      touched++;
    }
  }

  /* ---------- Automation rules: name and the e-mail they send ---------- */
  const ruleRows = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenantId));
  for (const rule of ruleRows) {
    const patch: { name?: string; actions?: unknown } = {};
    const nameKey = keyOf(rule.name, RULES);
    if (nameKey && seedText(nameKey, locale) !== rule.name) patch.name = seedText(nameKey, locale);

    const { next, changed } = relocalizeActions(rule.actions, locale);
    if (changed) patch.actions = next;

    if (Object.keys(patch).length > 0) {
      await db.update(automationRules).set(patch).where(eq(automationRules.id, rule.id));
      touched++;
    }
  }

  /* ---------- Ticket fields: the label and the select options ---------- */
  const fieldRows = await db
    .select()
    .from(ticketFields)
    .where(eq(ticketFields.tenantId, tenantId));
  for (const field of fieldRows) {
    const patch: { label?: string; options?: unknown } = {};
    const labelKey = keyOf(field.label, FIELDS);
    if (labelKey && seedText(labelKey, locale) !== field.label) {
      patch.label = seedText(labelKey, locale);
    }

    const options = (field.options ?? []) as string[];
    let optionsChanged = false;
    const nextOptions = options.map((option) => {
      const optionKey = typeof option === "string" ? keyOf(option, OPTIONS) : null;
      if (!optionKey) return option;
      const translated = seedText(optionKey, locale);
      if (translated === option) return option;
      optionsChanged = true;
      return translated;
    });
    if (optionsChanged) patch.options = nextOptions;

    if (Object.keys(patch).length > 0) {
      await db.update(ticketFields).set(patch).where(eq(ticketFields.id, field.id));
      touched++;
    }
  }

  /* ---------- Ticket forms ---------- */
  await rename(
    await db.select().from(ticketForms).where(eq(ticketForms.tenantId, tenantId)),
    FORMS,
    (id, name) => db.update(ticketForms).set({ name }).where(eq(ticketForms.id, id)),
  );

  return touched;
}

/** Every workspace, each into its own language. Run from `pnpm db:relocalize`. */
export async function relocalizeAllTenants(): Promise<void> {
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, locale: tenants.locale })
    .from(tenants);
  for (const row of rows) {
    const touched = await relocalizeDefaults(row.id, row.locale ?? "en");
    console.log(`  ${row.slug} (${row.locale}) — ${touched} row(s) rewritten`);
  }
}

if (process.argv[1]?.endsWith("relocalize.ts")) {
  relocalizeAllTenants()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
