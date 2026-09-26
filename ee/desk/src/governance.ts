import { and, eq, isNull } from "drizzle-orm";
import { accessGrants, deskSodRules, withTenant } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";
import { DeskEeError, requireEntitlement } from "./gov/entitlements";
import { journal } from "./gov/audit";
import { tiersExist } from "./gov/common";

/* ---------------- Governance (deskGovernance) ---------------- */

export async function saveSodRule(tenantId: string, input: { id?: string; tierAId: string; tierBId: string; reason: string; enabled: boolean }, actor: Actor): Promise<string> {
  const reason = input.reason.trim();
  if (!reason) throw new DeskEeError("invalid_reason", "A separation-of-duties rule needs a reason");
  if (input.tierAId === input.tierBId) throw new DeskEeError("same_tier", "A rule needs two different tiers");
  return withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskGovernance");
    if (!(await tiersExist(tx, tenantId, [input.tierAId, input.tierBId]))) {
      throw new DeskEeError("tier_not_found", "Unknown licence tier");
    }
    const values = { tierAId: input.tierAId, tierBId: input.tierBId, reason, enabled: input.enabled };
    if (input.id) {
      const [before] = await tx
        .select()
        .from(deskSodRules)
        .where(and(eq(deskSodRules.tenantId, tenantId), eq(deskSodRules.id, input.id)))
        .limit(1);
      if (!before) throw new DeskEeError("rule_not_found", "Unknown separation-of-duties rule");
      await tx.update(deskSodRules).set(values).where(eq(deskSodRules.id, input.id));
      await journal(tx, tenantId, actor, "desk.sod_rule.updated", { type: "desk_sod_rule", id: input.id }, {
        before: { tierAId: before.tierAId, tierBId: before.tierBId, reason: before.reason, enabled: before.enabled },
        after: values,
      });
      return input.id;
    }
    const [row] = await tx.insert(deskSodRules).values({ tenantId, ...values }).returning({ id: deskSodRules.id });
    await journal(tx, tenantId, actor, "desk.sod_rule.created", { type: "desk_sod_rule", id: row!.id }, { after: values });
    return row!.id;
  });
}

export async function deleteSodRule(tenantId: string, ruleId: string, actor: Actor): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskGovernance");
    const [before] = await tx
      .delete(deskSodRules)
      .where(and(eq(deskSodRules.tenantId, tenantId), eq(deskSodRules.id, ruleId)))
      .returning();
    if (!before) return;
    await journal(tx, tenantId, actor, "desk.sod_rule.deleted", { type: "desk_sod_rule", id: ruleId }, {
      before: { tierAId: before.tierAId, tierBId: before.tierBId, reason: before.reason, enabled: before.enabled },
    });
  });
}

/** Current grants that already violate an enabled rule. */
export async function sodViolations(tenantId: string): Promise<Array<{ ruleId: string; personId: string }>> {
  return withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskGovernance");
    const rules = await tx
      .select({ id: deskSodRules.id, a: deskSodRules.tierAId, b: deskSodRules.tierBId })
      .from(deskSodRules)
      .where(and(eq(deskSodRules.tenantId, tenantId), eq(deskSodRules.enabled, true)));
    if (rules.length === 0) return [];
    const grants = await tx
      .select({ personId: accessGrants.personId, tierId: accessGrants.tierId })
      .from(accessGrants)
      .where(and(eq(accessGrants.tenantId, tenantId), isNull(accessGrants.revokedAt)));
    const held = new Map<string, Set<string>>();
    for (const g of grants) {
      let set = held.get(g.personId);
      if (!set) held.set(g.personId, (set = new Set()));
      set.add(g.tierId);
    }
    const out: Array<{ ruleId: string; personId: string }> = [];
    for (const r of rules) {
      for (const [personId, tiers] of held) {
        if (tiers.has(r.a) && tiers.has(r.b)) out.push({ ruleId: r.id, personId });
      }
    }
    return out;
  });
}
