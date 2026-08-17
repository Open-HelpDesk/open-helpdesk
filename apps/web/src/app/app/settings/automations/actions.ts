"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { automationRules, db, tickets } from "@openhelpdesk/db";
import { and, asc, desc, eq, isNull, not } from "drizzle-orm";
import { evaluateConditions, type Condition, type RuleEvent } from "@openhelpdesk/rules";
import { ruleSummary } from "@/lib/rule-labels";
import { requireManager } from "../guard";

const VALID_FIELDS = new Set([
  "event",
  "status",
  "priority",
  "channel",
  "type",
  "subject",
  "tags",
  "assignee",
  "team",
  "organization",
  "hours_since_created",
  "hours_since_updated",
]);
const VALID_OPERATORS = new Set(["is", "is_not", "contains", "includes", "empty", "not_empty", "gte", "lte"]);
const VALID_ACTIONS = new Set([
  "set_status",
  "set_priority",
  "assign_user",
  "assign_team",
  "assign_round_robin",
  "add_tags",
  "email_contact",
]);

function sanitizeConditions(raw: unknown): { field: string; operator: string; value?: unknown }[] {
  const parsed = typeof raw === "string" ? safeParse(raw) : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (c): c is { field: string; operator: string; value?: unknown } =>
      typeof c === "object" &&
      c !== null &&
      VALID_FIELDS.has((c as { field?: string }).field ?? "") &&
      VALID_OPERATORS.has((c as { operator?: string }).operator ?? ""),
  );
}

function sanitizeActions(raw: unknown): { type: string; value?: unknown }[] {
  const parsed = typeof raw === "string" ? safeParse(raw) : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (a): a is { type: string; value?: unknown } =>
      typeof a === "object" && a !== null && VALID_ACTIONS.has((a as { type?: string }).type ?? ""),
  );
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveRule(formData: FormData) {
  const { tenant } = await requireManager();
  const ruleId = String(formData.get("ruleId") ?? "");
  const kind = formData.get("kind") === "scheduled" ? "scheduled" : "trigger";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const values = {
    name,
    conditionsAll: sanitizeConditions(formData.get("conditionsAll")),
    conditionsAny: sanitizeConditions(formData.get("conditionsAny")),
    actions: sanitizeActions(formData.get("actions")),
    active: formData.get("active") === "on",
  };

  if (ruleId) {
    await db
      .update(automationRules)
      .set(values)
      .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  } else {
    const existing = await db
      .select({ position: automationRules.position })
      .from(automationRules)
      .where(eq(automationRules.tenantId, tenant.id));
    const position = existing.length > 0 ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
    await db.insert(automationRules).values({ tenantId: tenant.id, kind, position, ...values });
  }

  revalidatePath("/app/settings/automations");
  redirect("/app/settings/automations?saved=1");
}

export async function toggleRule(formData: FormData) {
  const { tenant } = await requireManager();
  const ruleId = String(formData.get("ruleId"));
  await db
    .update(automationRules)
    .set({ active: not(automationRules.active) })
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  revalidatePath("/app/settings/automations");
}

export async function deleteRule(formData: FormData) {
  const { tenant } = await requireManager();
  const ruleId = String(formData.get("ruleId"));
  await db
    .delete(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  revalidatePath("/app/settings/automations");
}

export async function duplicateRule(formData: FormData) {
  const { tenant } = await requireManager();
  const ruleId = String(formData.get("ruleId"));
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  if (!rule) return;
  await db.insert(automationRules).values({
    tenantId: tenant.id,
    kind: rule.kind,
    name: `${rule.name} (copie)`,
    position: rule.position + 1,
    active: false,
    conditionsAll: rule.conditionsAll,
    conditionsAny: rule.conditionsAny,
    actions: rule.actions,
  });
  revalidatePath("/app/settings/automations");
}

/** L'ordre d'exécution compte : échange de positions avec la règle voisine. */
export async function moveRule(formData: FormData) {
  const { tenant } = await requireManager();
  const ruleId = String(formData.get("ruleId"));
  const direction = formData.get("direction") === "up" ? "up" : "down";

  // Même tri que la liste ST-05 : position, puis kind et nom (createdAt ne
  // discrimine pas les lignes insérées dans une même transaction de seed).
  const siblings = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenant.id))
    .orderBy(asc(automationRules.position), asc(automationRules.kind), asc(automationRules.name));

  const index = siblings.findIndex((r) => r.id === ruleId);
  if (index < 0) return;
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  // Positions normalisées à l'index pour éviter les doublons hérités.
  const reordered = [...siblings];
  [reordered[index], reordered[swapIndex]] = [reordered[swapIndex]!, reordered[index]!];
  for (let i = 0; i < reordered.length; i++) {
    await db
      .update(automationRules)
      .set({ position: i })
      .where(eq(automationRules.id, reordered[i]!.id));
  }
  revalidatePath("/app/settings/automations");
}

/**
 * « Tester sur un ticket existant » (ST-05) : simulation sur le ticket le plus
 * récent via evaluateConditions — AUCUNE modification appliquée.
 */
export async function testRule(payload: {
  conditionsAll: unknown;
  conditionsAny: unknown;
  actions: unknown;
}): Promise<{ ok: boolean; text: string }> {
  const { tenant } = await requireManager();
  const conditionsAll = sanitizeConditions(payload.conditionsAll) as Condition[];
  const conditionsAny = sanitizeConditions(payload.conditionsAny) as Condition[];
  const actions = sanitizeActions(payload.actions);

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), isNull(tickets.deletedAt)))
    .orderBy(desc(tickets.createdAt))
    .limit(1);

  if (!ticket) {
    return { ok: false, text: "Aucun ticket dans le workspace — créez un ticket pour tester." };
  }

  // L'événement simulé suit la condition « Événement » si elle est posée.
  const eventCondition = conditionsAll.find((c) => c.field === "event" && c.operator === "is");
  const event = (eventCondition?.value as RuleEvent) ?? "ticket.updated";

  const matches = evaluateConditions({ event, ticket }, conditionsAll, conditionsAny);
  const label = `#${ticket.number}`;

  if (!matches) {
    return { ok: false, text: `${label} → la règle ne s'appliquerait pas (conditions non remplies).` };
  }

  const summary = ruleSummary([], [], actions as never[]).replace(/^Si toujours → /, "");
  return { ok: true, text: `${label} → la règle s'appliquerait : ${summary}` };
}
