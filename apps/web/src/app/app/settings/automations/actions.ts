"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { automationRules, db } from "@openhelpdesk/db";
import { and, asc, eq, not } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

const VALID_FIELDS = new Set([
  "event",
  "status",
  "priority",
  "channel",
  "subject",
  "tags",
  "assignee",
  "organization",
  "hours_since_created",
  "hours_since_updated",
]);
const VALID_OPERATORS = new Set(["is", "is_not", "contains", "includes", "empty", "not_empty", "gte", "lte"]);
const VALID_ACTIONS = new Set(["set_status", "set_priority", "assign_user", "assign_team", "add_tags", "email_contact"]);

function parseConditions(raw: unknown): { field: string; operator: string; value?: unknown }[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is { field: string; operator: string; value?: unknown } =>
        typeof c === "object" &&
        c !== null &&
        VALID_FIELDS.has((c as { field?: string }).field ?? "") &&
        VALID_OPERATORS.has((c as { operator?: string }).operator ?? ""),
    );
  } catch {
    return [];
  }
}

function parseActions(raw: unknown): { type: string; value?: unknown }[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is { type: string; value?: unknown } =>
        typeof a === "object" && a !== null && VALID_ACTIONS.has((a as { type?: string }).type ?? ""),
    );
  } catch {
    return [];
  }
}

export async function saveRule(formData: FormData) {
  const { tenant } = await requireAgent();
  const ruleId = String(formData.get("ruleId") ?? "");
  const kind = formData.get("kind") === "scheduled" ? "scheduled" : "trigger";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const values = {
    name,
    conditionsAll: parseConditions(formData.get("conditionsAll")),
    conditionsAny: parseConditions(formData.get("conditionsAny")),
    actions: parseActions(formData.get("actions")),
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
      .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.kind, kind)));
    const position = existing.length > 0 ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
    await db.insert(automationRules).values({ tenantId: tenant.id, kind, position, ...values });
  }

  revalidatePath("/app/settings/automations");
  redirect(`/app/settings/automations?kind=${kind}`);
}

export async function toggleRule(formData: FormData) {
  const { tenant } = await requireAgent();
  const ruleId = String(formData.get("ruleId"));
  await db
    .update(automationRules)
    .set({ active: not(automationRules.active) })
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  revalidatePath("/app/settings/automations");
}

export async function deleteRule(formData: FormData) {
  const { tenant } = await requireAgent();
  const ruleId = String(formData.get("ruleId"));
  await db
    .delete(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  revalidatePath("/app/settings/automations");
}

export async function duplicateRule(formData: FormData) {
  const { tenant } = await requireAgent();
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
  const { tenant } = await requireAgent();
  const ruleId = String(formData.get("ruleId"));
  const direction = formData.get("direction") === "up" ? "up" : "down";

  const [rule] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.id, ruleId)));
  if (!rule) return;

  const siblings = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.tenantId, tenant.id), eq(automationRules.kind, rule.kind)))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));

  const index = siblings.findIndex((r) => r.id === rule.id);
  const swapWith = direction === "up" ? siblings[index - 1] : siblings[index + 1];
  if (!swapWith) return;

  // Positions normalisées à l'index pour éviter les doublons hérités.
  const reordered = [...siblings];
  reordered[index] = swapWith;
  reordered[direction === "up" ? index - 1 : index + 1] = rule;
  for (let i = 0; i < reordered.length; i++) {
    await db
      .update(automationRules)
      .set({ position: i })
      .where(eq(automationRules.id, reordered[i]!.id));
  }
  revalidatePath("/app/settings/automations");
}
