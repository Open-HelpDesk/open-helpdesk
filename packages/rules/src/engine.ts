import { automationRules, automationRuns, db, tickets } from "@openhelpdesk/db";
import { dispatchWebhookEvent } from "@openhelpdesk/webhooks";
import { notifyOnNewMessage } from "@openhelpdesk/push";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
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
  // Outbound webhooks last: triggers may still change the priority, and the
  // payload should carry the ticket as it ended up. Dispatched from here rather
  // than from each channel — email, portal, widget, API and IMAP all come
  // through this function, so no channel can be forgotten.
  await dispatchWebhookEvent(tenantId, "ticket.created", ticketId);
}

/** Orchestration after a contact reply (portal or email). */
export async function onContactMessage(tenantId: string, ticketId: string): Promise<void> {
  await runTriggers("message.created", tenantId, ticketId);
  await onContactReplySla(tenantId, ticketId);
  await dispatchWebhookEvent(tenantId, "message.created", ticketId);
  /*
   * Push last, and from here for the same reason the webhook is: every channel
   * that adds a message comes through this function. Who gets woken is derived
   * from the message's own author, so the public API's agent replies — which
   * also travel this path — reach the customer rather than the assignee.
   */
  await notifyOnNewMessage(tenantId, ticketId);
}

/**
 * The tickets this rule has already acted on since they last changed.
 *
 * A scheduled rule's conditions are true for as long as the situation lasts:
 * "48 hours since the last update" stays true at the 49th hour, the 50th, and
 * every sweep in between. Whether that re-fires depends entirely on whether the
 * rule's own actions move the ticket — and that is not a property anyone chose,
 * it is an accident of which actions a rule happens to use.
 *
 * `automation_runs` already recorded every application; nothing read it. This
 * reads it, and the comparison against `tickets.updated_at` is what makes the
 * guard self-arming: a reply, a status change or an agent's edit moves
 * `updated_at` past the last run, and the rule becomes eligible again. So a
 * 48-hour reminder fires once, then once more if the customer answers and goes
 * quiet again — which is what a reminder is for.
 *
 * One query per rule rather than one per candidate: a tenant with 500 open
 * tickets would otherwise pay 500 round-trips every five minutes.
 */
async function alreadyActed(ruleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ ticketId: automationRuns.ticketId })
    .from(automationRuns)
    .innerJoin(tickets, eq(tickets.id, automationRuns.ticketId))
    .where(and(eq(automationRuns.ruleId, ruleId), gte(automationRuns.createdAt, tickets.updatedAt)));
  return new Set(rows.map((r) => r.ticketId).filter((id): id is string => id !== null));
}

/**
 * Scheduled rules (ST-05): periodic sweep — time conditions
 * (hours_since_updated…) evaluated on the non-closed tickets and the recently resolved ones.
 *
 * **A rule acts once per ticket per episode**, not once per sweep. Without that
 * guard a rule whose only action is a side effect — `email_contact` writes
 * nothing back to the ticket, so `updated_at` never moves — matched again five
 * minutes later, forever. Measured on staging: one reminder rule, 32 094
 * executions across 7 tickets in fifteen days, an email to the customer each
 * time. The rule beside it, which sets a status, had run exactly once per
 * ticket on a hundred tickets: the ones that change the ticket stop themselves,
 * and only those.
 */
export async function runScheduledRules(now: Date = new Date()): Promise<number> {
  const rules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.kind, "scheduled"), eq(automationRules.active, true)))
    .orderBy(asc(automationRules.position));

  let appliedCount = 0;
  for (const rule of rules) {
    const [candidates, acted] = await Promise.all([
      db
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
        .limit(500),
      alreadyActed(rule.id),
    ]);

    for (const ticket of candidates) {
      /* Déjà agi depuis le dernier changement du ticket : la situation est la
         même qu'au passage précédent, et la règle a déjà répondu. */
      if (acted.has(ticket.id)) continue;
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
