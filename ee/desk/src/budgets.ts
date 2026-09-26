import { and, eq } from "drizzle-orm";
import { deskBudgets, withTenant } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";
import { DeskEeError, requireEntitlement } from "./gov/entitlements";
import { journal } from "./gov/audit";
import { departmentMonthlySpend, loadDeskConfig } from "./gov/common";

/* ---------------- Budgets (deskBudgets) ---------------- */

/** Upserts a department's ceiling, in the unit of `budgets.period` (monthly or yearly). */
export async function setBudget(tenantId: string, department: string, amountCents: number, actor: Actor): Promise<void> {
  const dept = department.trim();
  if (!dept) throw new DeskEeError("invalid_department", "A budget needs a department");
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new DeskEeError("invalid_amount", "A budget is a non-negative whole number of cents");
  }
  await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskBudgets");
    const [before] = await tx
      .select({ id: deskBudgets.id, amountCents: deskBudgets.amountCents })
      .from(deskBudgets)
      .where(and(eq(deskBudgets.tenantId, tenantId), eq(deskBudgets.department, dept)))
      .limit(1);
    if (before?.amountCents === amountCents) return;
    const { period } = (await loadDeskConfig(tx, tenantId)).budgets;
    const [row] = await tx
      .insert(deskBudgets)
      .values({ tenantId, department: dept, amountCents })
      .onConflictDoUpdate({
        target: [deskBudgets.tenantId, deskBudgets.department],
        set: { amountCents, updatedAt: new Date() },
      })
      .returning({ id: deskBudgets.id });
    await journal(tx, tenantId, actor, "desk.budget.set", { type: "desk_budget", id: row?.id ?? null }, {
      before: before ? { department: dept, amountCents: before.amountCents } : null,
      after: { department: dept, amountCents, period },
    });
  });
}

/** Monthly licence spend of a department (active grants × tier cost). */
export async function departmentSpendCents(tenantId: string, department: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskBudgets");
    return departmentMonthlySpend(tx, tenantId, department);
  });
}
