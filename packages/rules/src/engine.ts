import { automationRules, db, tickets } from "@openhelpdesk/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { applyActions } from "./apply";
import { evaluateConditions } from "./evaluate";
import { applySlaOnCreate, onContactReplySla } from "./sla";
import type { Condition, RuleAction, RuleEvent } from "./types";

type TicketRow = typeof tickets.$inferSelect;

/**
 * Triggers (ST-05): evaluated in order on each event, in a single pass —
 * a rule's actions do not re-trigger the rules (no loop possible).
 */
export async function runTriggers(
  event: RuleEvent,
  tenantId: string,
  ticketId: string,
): Promise<number> {
  let [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket || ticket.mergedIntoId || ticket.deletedAt) return 0;

  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.tenantId, tenantId),
        eq(automationRules.kind, "trigger"),
        eq(automationRules.active, true),
      ),
    )
    .orderBy(asc(automationRules.position));

  let appliedCount = 0;
  for (const rule of rules) {
    const matches = evaluateConditions(
      { event, ticket },
      (rule.conditionsAll as Condition[]) ?? [],
      (rule.conditionsAny as Condition[]) ?? [],
    );
    if (!matches) continue;
    ticket = await applyActions(ticket, (rule.actions as RuleAction[]) ?? [], rule);
    appliedCount += 1;
  }
  if (appliedCount > 0) {
    await db
      .update(automationRules)
      .set({ lastRunAt: new Date() })
      .where(inArray(automationRules.id, rules.map((r) => r.id)));
  }
  return appliedCount;
}

/** Orchestration after a ticket is created: triggers first (they can change the priority), SLA next. */
export async function onTicketCreated(tenantId: string, ticketId: string): Promise<void> {
  await runTriggers("ticket.created", tenantId, ticketId);
  await applySlaOnCreate(tenantId, ticketId);
}

/** Orchestration after a contact reply (portal or email). */
export async function onContactMessage(tenantId: string, ticketId: string): Promise<void> {
  await runTriggers("message.created", tenantId, ticketId);
  await onContactReplySla(tenantId, ticketId);
}

/**
 * Scheduled rules (ST-05): periodic sweep — time conditions
 * (hours_since_updated…) evaluated on the non-closed tickets and the recently resolved ones.
 */
export async function runScheduledRules(now: Date = new Date()): Promise<number> {
  const rules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.kind, "scheduled"), eq(automationRules.active, true)))
    .orderBy(asc(automationRules.position));

  let appliedCount = 0;
  for (const rule of rules) {
    const candidates = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.tenantId, rule.tenantId),
          isNull(tickets.deletedAt),
          isNull(tickets.mergedIntoId),
          inArray(tickets.status, ["new", "open", "waiting", "on_hold", "resolved"]),
        ),
      )
      .limit(500);

    for (const ticket of candidates) {
      const matches = evaluateConditions(
        { event: "ticket.updated", ticket, now },
        (rule.conditionsAll as Condition[]) ?? [],
        (rule.conditionsAny as Condition[]) ?? [],
      );
      if (!matches) continue;
      await applyActions(ticket, (rule.actions as RuleAction[]) ?? [], rule);
      appliedCount += 1;
    }
    await db
      .update(automationRules)
      .set({ lastRunAt: now })
      .where(eq(automationRules.id, rule.id));
  }
  return appliedCount;
}
