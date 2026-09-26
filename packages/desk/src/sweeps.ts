/**
 * Periodic sweeps run by apps/worker: approval reminders and escalations,
 * grant expiry reminders and revocations. Idempotent by construction — each
 * reads state and acts on what it finds, and marks what it did (remindedAt,
 * escalatedAt, a journal line) so a replay does nothing twice.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { accessApprovals, accessGrants, accessRequests, auditEvents, db, deskApps, deskAppTiers, people } from "@openhelpdesk/db";
import { writeDeskAudit } from "./audit";
import { namesOf } from "./circuit-db";
import { domainT } from "./i18n";
import { endGrantTx } from "./grants";
import { addDays, dateIn, daysBetween, inTenant, loadConfig, tenantInfo } from "./internal";
import { queueNotification } from "./notify";
import { AWAITING_STATES, notifyApprover, remindTx, requestContext } from "./requests";
import type { Actor } from "./types";

const HOUR = 3_600_000;

export async function sweepApprovalReminders(now: Date = new Date(), opts: { tenantId?: string } = {}): Promise<{ reminded: number; escalated: number }> {
  const out = { reminded: 0, escalated: 0 };
  const candidates = await db
    .select({ approvalId: accessApprovals.id, requestId: accessApprovals.requestId, tenantId: accessApprovals.tenantId })
    .from(accessApprovals)
    .innerJoin(accessRequests, eq(accessRequests.id, accessApprovals.requestId))
    .where(
      and(
        eq(accessApprovals.decision, "pending"),
        isNull(accessApprovals.escalatedAt),
        inArray(accessRequests.state, [...AWAITING_STATES]),
        lte(accessRequests.createdAt, new Date(now.getTime() - HOUR)),
        opts.tenantId ? eq(accessApprovals.tenantId, opts.tenantId) : undefined,
      ),
    )
    .limit(500);

  for (const c of candidates) {
    try {
      const did = await inTenant(c.tenantId, async (tx, fx) => {
        const approvals = await tx.select().from(accessApprovals).where(eq(accessApprovals.requestId, c.requestId)).orderBy(asc(accessApprovals.position));
        const current = approvals.find((a) => a.decision === "pending");
        // Only the step the request is waiting on; later steps have not started their clock.
        if (!current || current.id !== c.approvalId || current.escalatedAt) return null;
        const [request] = await tx.select().from(accessRequests).where(eq(accessRequests.id, c.requestId));
        if (!request || !(AWAITING_STATES as readonly string[]).includes(request.state)) return null;
        const config = await loadConfig(tx, c.tenantId);
        const previous = approvals.filter((a) => a.position < current.position && a.decidedAt).map((a) => a.decidedAt!.getTime());
        const since = Math.max(request.createdAt.getTime(), ...previous);
        const hours = (now.getTime() - since) / HOUR;

        if (hours >= config.approvals.escalateAfterHours) {
          const rule: Actor = { kind: "rule", rule: "approvals.escalateAfterHours" };
          const tenant = await tenantInfo(tx, c.tenantId);
          const [approver] = current.approverPersonId
            ? await tx.select({ id: people.id, name: people.name, managerId: people.managerId }).from(people).where(eq(people.id, current.approverPersonId))
            : [];
          let upId: string | null = approver?.managerId ?? null;
          if (upId) {
            const [up] = await tx.select({ id: people.id, status: people.status }).from(people).where(eq(people.id, upId));
            // Rule 3 still holds on escalation: never to the requester, never to someone gone.
            if (!up || up.id === request.personId || up.status === "departed" || up.status === "suspended") upId = null;
          }
          await tx
            .update(accessApprovals)
            .set({
              escalatedAt: now,
              remindedAt: now,
              ...(upId ? { approverPersonId: upId, onBehalfOfPersonId: current.approverPersonId } : {}),
            })
            .where(eq(accessApprovals.id, current.id));
          const upName = upId ? ((await namesOf(tx, c.tenantId, [upId])).get(upId)?.name ?? null) : null;
          await writeDeskAudit(tx, c.tenantId, rule, "desk.approval.escalated", { type: "access_request", id: request.id }, {
            approver: upName,
            previous: approver?.name ?? null,
            hours: config.approvals.escalateAfterHours,
            approvalId: current.id,
            actor: null,
          });
          if (upId) {
            const rc = await requestContext(tx, c.tenantId, request);
            await notifyApprover(tx, fx, { tenant, config, actor: rule }, rc, { ...current, approverPersonId: upId }, "escalated", {
              previous: approver?.name ?? null,
              hours: config.approvals.escalateAfterHours,
            });
          }
          return "escalated" as const;
        }
        if (hours >= config.approvals.remindAfterHours && !current.remindedAt) {
          await remindTx(tx, fx, c.tenantId, request, current, { kind: "rule", rule: "approvals.remindAfterHours" }, true);
          return "reminded" as const;
        }
        return null;
      });
      if (did) out[did]++;
    } catch (err) {
      console.error(`[desk] reminder sweep failed on approval ${c.approvalId}:`, err);
    }
  }
  return out;
}

async function alreadyNotified(tx: Parameters<Parameters<typeof inTenant>[1]>[0], tenantId: string, grantId: string, marker: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.action, "desk.grant.expiry_notified"),
        eq(auditEvents.targetId, grantId),
        sql`${auditEvents.after}->>'marker' = ${marker}`,
      ),
    )
    .limit(1);
  return !!row;
}

export async function sweepGrantExpiries(now: Date = new Date(), opts: { tenantId?: string } = {}): Promise<{ notified: number; revoked: number }> {
  const out = { notified: 0, revoked: 0 };
  // 14 days is the longest reminder the configuration allows; a day of margin for time zones.
  const horizon = addDays(now.toISOString().slice(0, 10), 15);
  const candidates = await db
    .select({ id: accessGrants.id, tenantId: accessGrants.tenantId })
    .from(accessGrants)
    .where(
      and(
        isNull(accessGrants.revokedAt),
        isNotNull(accessGrants.expiresOn),
        lte(accessGrants.expiresOn, horizon),
        opts.tenantId ? eq(accessGrants.tenantId, opts.tenantId) : undefined,
      ),
    )
    .limit(1000);

  for (const c of candidates) {
    try {
      const did = await inTenant(c.tenantId, async (tx, fx) => {
        const [grant] = await tx.select().from(accessGrants).where(eq(accessGrants.id, c.id));
        if (!grant || grant.revokedAt || !grant.expiresOn) return null;
        const [tenant, config] = await Promise.all([tenantInfo(tx, c.tenantId), loadConfig(tx, c.tenantId)]);
        const today = dateIn(tenant.timezone, now);
        const daysLeft = daysBetween(today, grant.expiresOn);
        const [app] = await tx.select({ name: deskApps.name }).from(deskApps).where(eq(deskApps.id, grant.appId));
        const [tier] = await tx.select({ name: deskAppTiers.name }).from(deskAppTiers).where(eq(deskAppTiers.id, grant.tierId));
        const [person] = await tx.select({ name: people.name, email: people.email }).from(people).where(eq(people.id, grant.personId));
        const names = { app: app?.name ?? "—", tier: tier?.name ?? "—", person: person?.name ?? "—" };

        if (daysLeft <= 0) {
          if (!config.access.revokeOnExpiry) return null;
          const rule: Actor = { kind: "rule", rule: "access.revokeOnExpiry" };
          await endGrantTx(tx, c.tenantId, grant, config, { reason: "expired", actor: rule });
          await writeDeskAudit(tx, c.tenantId, rule, "desk.grant.expired", { type: "access_grant", id: grant.id }, { ...names, date: grant.expiresOn, actor: null });
          return "revoked" as const;
        }

        const marker = daysLeft <= 1 ? "last" : daysLeft <= config.access.expiryReminderDays ? "first" : null;
        if (!marker || (await alreadyNotified(tx, c.tenantId, grant.id, marker))) return null;
        if (person) {
          const t = domainT(tenant.locale);
          const date = t.fmt.dateLong(new Date(`${grant.expiresOn}T12:00:00Z`));
          queueNotification(fx, tenant, config, {
            event: "access_expiring",
            to: { email: person.email, name: person.name },
            subject: ["desk.domain.mail.expiringSubject", { app: names.app, date }],
            lines: [["desk.domain.mail.expiringBody", { app: names.app, tier: names.tier, date }]],
            button: ["desk.domain.mail.buttonMyAccess", "/desk/mine"],
          });
        }
        await writeDeskAudit(tx, c.tenantId, { kind: "rule", rule: "access.expiryReminderDays" }, "desk.grant.expiry_notified", { type: "access_grant", id: grant.id }, {
          ...names,
          date: grant.expiresOn,
          daysLeft,
          marker,
          actor: null,
        });
        return "notified" as const;
      });
      if (did) out[did]++;
    } catch (err) {
      console.error(`[desk] expiry sweep failed on grant ${c.id}:`, err);
    }
  }
  return out;
}
