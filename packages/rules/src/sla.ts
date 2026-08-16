/**
 * SLA (ST-07) : la première politique dont les conditions matchent s'applique.
 * Calcul 24/7 tant que la politique n'a pas de calendrier ouvré (le calcul en heures
 * ouvrées arrive avec l'écran ST-07). Le worker balaye les échéances : avertissement
 * à T-30 min, dépassement — chacun une seule fois (sla_warned_at / sla_breached_at).
 */
import { db, slaPolicies, ticketMessages, tickets } from "@openhelpdesk/db";
import { and, asc, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { evaluateConditions } from "./evaluate";
import type { Condition, SlaTargets } from "./types";

const MIN = 60_000;
const WARN_BEFORE_MS = 30 * MIN;

async function matchPolicy(ticket: typeof tickets.$inferSelect) {
  const policies = await db
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.tenantId, ticket.tenantId))
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

  const base = ticket.createdAt.getTime();
  await db
    .update(tickets)
    .set({
      slaPolicyId: policy.id,
      firstReplyDueAt: targets.firstReplyMin ? new Date(base + targets.firstReplyMin * MIN) : null,
      resolveDueAt: targets.resolveMin ? new Date(base + targets.resolveMin * MIN) : null,
    })
    .where(eq(tickets.id, ticket.id));
}

/** Réponse d'un contact → échéance de prochaine réponse (si la politique en définit une). */
export async function onContactReplySla(tenantId: string, ticketId: string): Promise<void> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
  if (!ticket?.slaPolicyId) return;

  const [policy] = await db.select().from(slaPolicies).where(eq(slaPolicies.id, ticket.slaPolicyId));
  const nextReplyMin = policy ? (policy.targets as SlaTargets)[ticket.priority]?.nextReplyMin : undefined;
  if (!nextReplyMin) return;

  await db
    .update(tickets)
    .set({ nextReplyDueAt: new Date(Date.now() + nextReplyMin * MIN), slaWarnedAt: null })
    .where(eq(tickets.id, ticket.id));
}

/** Réponse publique d'un agent → l'échéance de réponse est tenue. */
export async function onAgentReplySla(tenantId: string, ticketId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ nextReplyDueAt: null, slaWarnedAt: null })
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
}

/** Échéance active d'un ticket : 1ʳᵉ réponse tant qu'elle est due, sinon la plus proche. */
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
 * Balayage périodique du worker : avertissement T-30 min puis dépassement,
 * chacun une seule fois. Les compteurs sont suspendus sur En attente / En pause.
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
        bodyText: `SLA dépassé (échéance ${due.toLocaleString("fr-FR")})`,
      });
      breached += 1;
    } else if (remaining > 0 && remaining <= WARN_BEFORE_MS && !ticket.slaWarnedAt) {
      await db.update(tickets).set({ slaWarnedAt: now }).where(eq(tickets.id, ticket.id));
      await db.insert(ticketMessages).values({
        tenantId: ticket.tenantId,
        ticketId: ticket.id,
        kind: "system_event",
        authorType: "system",
        bodyText: `SLA : échéance dans moins de 30 minutes (${due.toLocaleString("fr-FR")})`,
      });
      warned += 1;
    }
  }
  return { warned, breached };
}
