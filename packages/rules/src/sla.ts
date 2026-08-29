/**
 * SLA (ST-07): the first policy whose conditions match applies.
 * 24/7 computation as long as the policy has no business calendar (the business hours
 * computation arrives with the ST-07 screen). The worker sweeps the due dates: warning
 * at T-30 min, breach — each only once (sla_warned_at / sla_breached_at).
 */
import { businessHours, db, slaPolicies, ticketMessages, tickets } from "@openhelpdesk/db";
import { and, asc, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { evaluateConditions } from "./evaluate";
import { addBusinessMinutes, type BusinessCalendar } from "./business-hours";
import type { Condition, SlaTargets } from "./types";

/** Business calendar of a policy — null = 24/7. */
async function calendarFor(businessHoursId: string | null): Promise<BusinessCalendar | null> {
  if (!businessHoursId) return null;
  const [row] = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.id, businessHoursId));
  if (!row) return null;
  return {
    timezone: row.timezone,
    weeklyHours: (row.weeklyHours ?? {}) as BusinessCalendar["weeklyHours"],
    holidays: (row.holidays ?? []) as BusinessCalendar["holidays"],
  };
}

const MIN = 60_000;
const WARN_BEFORE_MS = 30 * MIN;

/**
 * Due date written into the internal notes below. Neither a locale nor a time zone:
 * a package knows neither the tenant's language nor its dictionaries
 * (apps/web/src/i18n), and a localized format would lie as soon as the tenant reads
 * in another language. The ISO-8601 slice (UTC, "2026-08-22 14:30") is unambiguous
 * everywhere. The note text itself stays in English for the same reason.
 */
function dueLabel(due: Date): string {
  return due.toISOString().slice(0, 16).replace("T", " ");
}

async function matchPolicy(ticket: typeof tickets.$inferSelect) {
  // A deactivated policy is skipped, not deleted: the ticket falls through to
  // the next one that matches, and ultimately to the default policy.
  const policies = await db
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, ticket.tenantId), eq(slaPolicies.active, true)))
    .orderBy(asc(slaPolicies.position));
  for (const policy of policies) {
    const conditions = (policy.conditions as Condition[]) ?? [];
    if (
      conditions.length === 0 ||
      evaluateConditions({ event: "ticket.created", ticket }, conditions, [])
    ) {
      return policy;
    }
  }
  return undefined;
}

export async function applySlaOnCreate(tenantId: string, ticketId: string): Promise<void> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket) return;

  const policy = await matchPolicy(ticket);
  if (!policy) return;
  const targets = (policy.targets as SlaTargets)[ticket.priority];
  if (!targets) return;

  // Due dates computed in the business hours of the policy's calendar (24/7 without a calendar).
  const calendar = await calendarFor(policy.businessHoursId);
  await db
    .update(tickets)
    .set({
      slaPolicyId: policy.id,
      firstReplyDueAt: targets.firstReplyMin
        ? addBusinessMinutes(ticket.createdAt, targets.firstReplyMin, calendar)
        : null,
      resolveDueAt: targets.resolveMin
        ? addBusinessMinutes(ticket.createdAt, targets.resolveMin, calendar)
        : null,
    })
    .where(eq(tickets.id, ticket.id));
}

/** Reply from a contact → next reply due date (if the policy defines one). */
export async function onContactReplySla(tenantId: string, ticketId: string): Promise<void> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket?.slaPolicyId) return;

  const [policy] = await db.select().from(slaPolicies).where(eq(slaPolicies.id, ticket.slaPolicyId));
  const nextReplyMin = policy ? (policy.targets as SlaTargets)[ticket.priority]?.nextReplyMin : undefined;
  if (!nextReplyMin) return;

  const calendar = await calendarFor(policy?.businessHoursId ?? null);
  await db
    .update(tickets)
    .set({
      nextReplyDueAt: addBusinessMinutes(new Date(), nextReplyMin, calendar),
      slaWarnedAt: null,
    })
    .where(eq(tickets.id, ticket.id));
}

/** Public reply from an agent → the reply due date is met. */
export async function onAgentReplySla(tenantId: string, ticketId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ nextReplyDueAt: null, slaWarnedAt: null })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
}

/** Active due date of a ticket: 1st reply as long as it is due, otherwise the nearest one. */
function activeDue(t: {
  firstRepliedAt: Date | null;
  firstReplyDueAt: Date | null;
  nextReplyDueAt: Date | null;
  resolveDueAt: Date | null;
}): Date | null {
  const dues: Date[] = [];
  if (!t.firstRepliedAt && t.firstReplyDueAt) dues.push(t.firstReplyDueAt);
  if (t.nextReplyDueAt) dues.push(t.nextReplyDueAt);
  if (t.resolveDueAt) dues.push(t.resolveDueAt);
  if (dues.length === 0) return null;
  return new Date(Math.min(...dues.map((d) => d.getTime())));
}

/**
 * Periodic sweep of the worker: T-30 min warning then breach, each only
 * once. The counters are suspended on Waiting / On hold.
 */
export async function scanSlaTimers(now: Date = new Date()): Promise<{ warned: number; breached: number }> {
  const candidates = await db
    .select()
    .from(tickets)
    .where(
      and(
        inArray(tickets.status, ["new", "open"]),
        isNull(tickets.deletedAt),
        isNull(tickets.mergedIntoId),
        or(
          isNotNull(tickets.firstReplyDueAt),
          isNotNull(tickets.nextReplyDueAt),
          isNotNull(tickets.resolveDueAt),
        ),
        or(isNull(tickets.slaBreachedAt), isNull(tickets.slaWarnedAt)),
      ),
    )
    .limit(1000);

  let warned = 0;
  let breached = 0;
  for (const ticket of candidates) {
    const due = activeDue(ticket);
    if (!due) continue;
    const remaining = due.getTime() - now.getTime();

    if (remaining <= 0 && !ticket.slaBreachedAt) {
      await db.update(tickets).set({ slaBreachedAt: now }).where(eq(tickets.id, ticket.id));
      await db.insert(ticketMessages).values({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        kind: "system_event",
        authorType: "system",
        bodyText: `SLA breached (due ${dueLabel(due)} UTC)`,
      });
      breached += 1;
    } else if (remaining > 0 && remaining <= WARN_BEFORE_MS && !ticket.slaWarnedAt) {
      await db.update(tickets).set({ slaWarnedAt: now }).where(eq(tickets.id, ticket.id));
      await db.insert(ticketMessages).values({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        kind: "system_event",
        authorType: "system",
        bodyText: `SLA: due in less than 30 minutes (${dueLabel(due)} UTC)`,
      });
      warned += 1;
    }
  }
  return { warned, breached };
}
