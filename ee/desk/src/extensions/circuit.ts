import { and, eq, or } from "drizzle-orm";
import { deskBudgets, deskSodRules } from "@openhelpdesk/db";
import type { BudgetCheck, CircuitContext, CircuitExtension, CircuitStep, DeskExtensions } from "@openhelpdesk/desk";
import { tenantEntitlements } from "../gov/entitlements";
import { departmentMonthlySpend, firstInChain, heldTierIds } from "../gov/common";

/**
 * Stable reasons for `blocked` — the screens translate them. The SoD reason
 * itself travels in `sodConflict.reason` (written by the admin).
 */
export const BLOCK_REASONS = {
  sod: "sod_conflict",
  budget: "budget_exceeded",
  noFinanceApprover: "no_finance_approver",
  noPrivilegedApprover: "no_privileged_approver",
} as const;

/**
 * The privileged second approver: the app owner, or — when the owner already
 * approves, is the requester, or cannot act — the next person up the owner's
 * chain. Never the requester, never someone already in the circuit. Without an
 * owner, the chain above the requester's last approver is used.
 */
async function privilegedStep(ctx: CircuitContext): Promise<CircuitStep> {
  const excluded = new Set<string>([ctx.person.id]);
  for (const s of ctx.steps) if (s.approverPersonId) excluded.add(s.approverPersonId);
  let start = ctx.app.ownerPersonId;
  if (!start) {
    const last = [...ctx.steps].reverse().find((s) => s.approverPersonId)?.approverPersonId ?? ctx.person.managerId;
    start = last ?? null;
  }
  const pick = await firstInChain(ctx.tx, ctx.tenantId, start, excluded);
  return {
    step: "privileged",
    approverPersonId: pick?.personId ?? null,
    onBehalfOfPersonId: pick?.skippedFrom ?? null,
    mergedSteps: [],
  };
}

async function sodCheck(ctx: CircuitContext): Promise<{ ruleId: string; reason: string } | null> {
  const rules = await ctx.tx
    .select({ id: deskSodRules.id, a: deskSodRules.tierAId, b: deskSodRules.tierBId, reason: deskSodRules.reason })
    .from(deskSodRules)
    .where(
      and(
        eq(deskSodRules.tenantId, ctx.tenantId),
        eq(deskSodRules.enabled, true),
        or(eq(deskSodRules.tierAId, ctx.tier.id), eq(deskSodRules.tierBId, ctx.tier.id)),
      ),
    );
  if (rules.length === 0) return null;
  const held = await heldTierIds(ctx.tx, ctx.tenantId, ctx.person.id);
  for (const r of rules) {
    const other = r.a === ctx.tier.id ? r.b : r.a;
    if (held.has(other)) return { ruleId: r.id, reason: r.reason };
  }
  return null;
}

async function budgetCheck(ctx: CircuitContext): Promise<BudgetCheck | null> {
  const department = ctx.person.department;
  if (!department) return null;
  const [budget] = await ctx.tx
    .select({ amountCents: deskBudgets.amountCents })
    .from(deskBudgets)
    .where(and(eq(deskBudgets.tenantId, ctx.tenantId), eq(deskBudgets.department, department)))
    .limit(1);
  if (!budget) return null;
  const factor = ctx.config.budgets.period === "yearly" ? 12 : 1;
  const spendCents = (await departmentMonthlySpend(ctx.tx, ctx.tenantId, department)) * factor;
  const costCents = ctx.tier.monthlyCostCents * factor;
  // A free tier changes nothing: it cannot "exceed" a budget, even one already exceeded.
  const overCents = costCents > 0 ? Math.max(0, spendCents + costCents - budget.amountCents) : 0;
  return { department, spendCents, budgetCents: budget.amountCents, overCents, mode: ctx.config.budgets.mode };
}

export async function extendCircuit(ctx: CircuitContext): Promise<CircuitExtension> {
  const out: CircuitExtension = { extraSteps: [], budget: null, sodConflict: null, blocked: null };
  const ent = await tenantEntitlements(ctx.tx, ctx.tenantId);
  const block = (reason: string) => {
    out.blocked ??= reason;
  };

  if (ent.deskGovernance) {
    if (ctx.tier.privileged && ctx.config.approvals.privilegedSecondApprover) {
      const step = await privilegedStep(ctx);
      out.extraSteps.push(step);
      if (!step.approverPersonId) block(BLOCK_REASONS.noPrivilegedApprover);
    }
    const conflict = await sodCheck(ctx);
    if (conflict) {
      out.sodConflict = conflict;
      if (ctx.config.approvals.enforceSod) block(BLOCK_REASONS.sod);
    }
  }

  if (ent.deskBudgets) {
    const budget = await budgetCheck(ctx);
    out.budget = budget;
    if (budget && budget.overCents > 0) {
      if (budget.mode === "block") {
        block(BLOCK_REASONS.budget);
      } else if (budget.mode === "finance") {
        const finance = ctx.config.budgets.financePersonId;
        // The requester is never their own approver — not even as finance.
        const approver = finance && finance !== ctx.person.id ? finance : null;
        out.extraSteps.push({ step: "finance", approverPersonId: approver, onBehalfOfPersonId: null, mergedSteps: [] });
        if (!approver) block(BLOCK_REASONS.noFinanceApprover);
      }
    }
  }

  return out;
}

/** Budget modes, separation of duties, privileged second approver (deskBudgets, deskGovernance). */
export const circuitExtensions: Pick<DeskExtensions, "extendCircuit"> = { extendCircuit };
