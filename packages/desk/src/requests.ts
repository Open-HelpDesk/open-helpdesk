/**
 * Access requests: preview, submission, decisions, cancellation, reminders
 * (spec 19 §3.1, §7). A request IS a ticket of type `access_request`.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { accessApprovals, accessGrants, accessRequests, deskAppTiers, people, peopleGroups, type Tx } from "@openhelpdesk/db";
import type { SubmitInput } from "./api";
import { writeDeskAudit } from "./audit";
import { stateForStep } from "./circuit";
import { loadApp, loadCircuit, namesOf } from "./circuit-db";
import type { DeskConfig } from "./config";
import { DeskForbiddenError, DeskNotFoundError, DeskValidationError } from "./errors";
import { createGrantTx, expiryFor } from "./grants";
import { domainT } from "./i18n";
import { actorName, agentRole, dateIn, inTenant, loadConfig, requireEntitlement, tenantInfo, type Effects, type TenantInfo } from "./internal";
import { queueNotification } from "./notify";
import { createDeskTicket, finishTicket } from "./tickets";
import type { Actor, ApprovalStepName, CircuitPreview, DecisionChannel } from "./types";

type RequestRow = typeof accessRequests.$inferSelect;
type ApprovalRow = typeof accessApprovals.$inferSelect;

export const OPEN_REQUEST_STATES = ["awaiting_manager", "awaiting_owner", "awaiting_extra", "provisioning", "provisioning_failed"] as const;
export const AWAITING_STATES = ["awaiting_manager", "awaiting_owner", "awaiting_extra"] as const;

export async function previewCircuit(tenantId: string, personId: string, appId: string, tierId: string): Promise<CircuitPreview> {
  return inTenant(tenantId, async (tx) => (await loadCircuit(tx, tenantId, personId, appId, tierId)).preview);
}

/* ---------------- Notifications to approvers ---------------- */

type RequestContext = { request: RequestRow; appName: string; tierName: string; requesterName: string; ticketNumber?: number };

async function requestContext(tx: Tx, tenantId: string, request: RequestRow): Promise<RequestContext> {
  const app = await loadApp(tx, tenantId, request.appId, { includeArchived: true });
  const names = await namesOf(tx, tenantId, [request.personId]);
  const [tier] = await tx.select({ name: deskAppTiers.name }).from(deskAppTiers).where(eq(deskAppTiers.id, request.tierId));
  return { request, appName: app.name, tierName: tier?.name ?? "—", requesterName: names.get(request.personId)?.name ?? "—" };
}

/** Tells the approver of `approval` there is something to decide; journaled whatever the channels. */
export async function notifyApprover(
  tx: Tx,
  fx: Effects,
  ctx: { tenant: TenantInfo; config: DeskConfig; actor: Actor },
  req: RequestContext,
  approval: Pick<ApprovalRow, "approverPersonId" | "step" | "onBehalfOfPersonId">,
  kind: "new" | "reminder" | "escalated",
  extra: { previous?: string | null; hours?: number } = {},
): Promise<void> {
  if (!approval.approverPersonId) return;
  const names = await namesOf(tx, ctx.tenant.id, [approval.approverPersonId]);
  const approver = names.get(approval.approverPersonId);
  if (!approver) return;
  const params = { app: req.appName, tier: req.tierName, requester: req.requesterName };
  const subject =
    kind === "reminder"
      ? (["desk.domain.mail.reminderSubject", params] as const)
      : kind === "escalated"
        ? (["desk.domain.mail.escalatedSubject", params] as const)
        : (["desk.domain.mail.toApproveSubject", params] as const);
  const lines: Array<[Parameters<ReturnType<typeof domainT>>[0], Record<string, string | number>]> = [["desk.domain.mail.toApproveBody", params]];
  if (kind === "escalated") lines.unshift(["desk.domain.mail.escalatedBody", { previous: extra.previous ?? "—", hours: extra.hours ?? 0 }]);
  queueNotification(fx, ctx.tenant, ctx.config, {
    event: "request_to_approve",
    to: { email: approver.email, name: approver.name },
    subject: [subject[0], subject[1]],
    lines,
    quote: req.request.justification,
    button: ["desk.domain.mail.buttonReview", "/desk/approvals"],
  });
  if (kind === "new") {
    await writeDeskAudit(tx, ctx.tenant.id, ctx.actor, "desk.request.notified", { type: "access_request", id: req.request.id }, {
      approver: approver.name,
      step: approval.step,
      channels: Object.entries(ctx.config.notifications.request_to_approve).filter(([, on]) => on).map(([c]) => c),
    });
  }
}

/* ---------------- Submission ---------------- */

function durationLabel(t: ReturnType<typeof domainT>, days: number | null): string {
  return days === null ? t("desk.domain.duration.permanent") : t("desk.domain.duration.days", { count: days });
}

export async function submitAccessRequest(tenantId: string, input: SubmitInput, actor: Actor): Promise<{ requestId: string; ticketNumber: number; state: string }> {
  return inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    if (actor.kind === "person" && actor.personId !== input.personId) throw new DeskForbiddenError("not_requester");
    if (actor.kind !== "person" && actor.kind !== "agent") throw new DeskForbiddenError("forbidden");

    // An extension of a temporary grant always goes through at least the manager (design SD-E2).
    let extending: typeof accessGrants.$inferSelect | null = null;
    if (input.extendsGrantId) {
      const [g] = await tx.select().from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.id, input.extendsGrantId)));
      if (!g || g.revokedAt || g.personId !== input.personId || g.appId !== input.appId) throw new DeskValidationError("invalid_input", "extendsGrantId");
      extending = g;
    }

    // Recomputed here, never taken from the client.
    const loaded = await loadCircuit(tx, tenantId, input.personId, input.appId, input.tierId, { minLevels: extending ? 1 : 0 });
    const { preview, app, tier, person, config, tenant, today } = loaded;
    if (person.status === "departed" || person.status === "suspended") throw new DeskValidationError("invalid_state");
    if (preview.blocked) throw new DeskValidationError("blocked", preview.blocked);
    if (!preview.durations.includes(input.durationDays)) throw new DeskValidationError("invalid_input", "durationDays");
    const justification = input.justification?.trim() || null;
    if (preview.justificationRequired && !justification) throw new DeskValidationError("justification_required");

    const [pending] = await tx
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(and(eq(accessRequests.tenantId, tenantId), eq(accessRequests.personId, person.id), eq(accessRequests.appId, app.id), inArray(accessRequests.state, [...OPEN_REQUEST_STATES])))
      .limit(1);
    if (pending) throw new DeskValidationError("duplicate_request");
    if (!extending) {
      const [active] = await tx
        .select({ id: accessGrants.id })
        .from(accessGrants)
        .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, person.id), eq(accessGrants.appId, app.id), isNull(accessGrants.revokedAt)))
        .limit(1);
      if (active) throw new DeskValidationError("active_grant");
    }

    const t = domainT(tenant.locale);
    const ticket = await createDeskTicket(tx, fx, {
      tenantId,
      type: "access_request",
      requesterContactId: person.contactId,
      subject: t(extending ? "desk.domain.ticket.extensionSubject" : "desk.domain.ticket.accessSubject", { app: app.name, tier: tier.name }),
      body: t("desk.domain.ticket.accessBody", {
        app: app.name,
        tier: tier.name,
        duration: durationLabel(t, input.durationDays),
        justification: justification ?? "—",
      }),
    });

    const auto = preview.effectiveLevels === 0;
    const firstStep = preview.steps[0];
    const state = auto || !firstStep ? "provisioning" : stateForStep(firstStep.step);
    const [request] = await tx
      .insert(accessRequests)
      .values({
        tenantId,
        ticketId: ticket.id,
        personId: person.id,
        appId: app.id,
        tierId: tier.id,
        durationDays: input.durationDays,
        justification,
        state,
        effectiveLevels: preview.effectiveLevels,
        autoRule: preview.autoRule,
        source: input.source ?? "portal",
        extendsGrantId: extending?.id ?? null,
        budgetOverCents: preview.budget ? preview.budget.overCents : null,
        decidedAt: auto ? new Date() : null,
      })
      .returning();
    const req = request!;

    if (preview.steps.length) {
      await tx.insert(accessApprovals).values(
        preview.steps.map((st, position) => ({
          tenantId,
          requestId: req.id,
          step: st.step,
          position,
          approverPersonId: st.approverPersonId,
          onBehalfOfPersonId: st.onBehalfOfPersonId,
          mergedSteps: st.mergedSteps,
        })),
      );
    }

    await writeDeskAudit(tx, tenantId, actor, "desk.request.submitted", { type: "access_request", id: req.id }, {
      app: app.name,
      tier: tier.name,
      person: person.name,
      durationDays: input.durationDays,
      ticketNumber: ticket.number,
      extension: !!extending,
      effectiveLevels: preview.effectiveLevels,
      budgetOverCents: preview.budget?.overCents ?? null,
    });

    if (auto) {
      let group: string | null = null;
      if (preview.autoRule?.startsWith("group:")) {
        const [g] = await tx.select({ name: peopleGroups.name }).from(peopleGroups).where(eq(peopleGroups.id, preview.autoRule.slice(6)));
        group = g?.name ?? null;
      }
      const rule: Actor = { kind: "rule", rule: preview.autoRule ?? "level0" };
      await writeDeskAudit(tx, tenantId, rule, "desk.request.auto_approved", { type: "access_request", id: req.id }, { rule: preview.autoRule, group, actor: null });
      await createGrantTx(tx, tenantId, { personId: person.id, app, tierId: tier.id, requestId: req.id, source: "request", expiresOn: expiryFor(today, input.durationDays), actor: rule });
    } else {
      const ctx = { tenant, config, actor };
      const rc: RequestContext = { request: req, appName: app.name, tierName: tier.name, requesterName: person.name };
      await notifyApprover(tx, fx, ctx, rc, firstStep!, "new");
    }
    return { requestId: req.id, ticketNumber: ticket.number, state };
  });
}

/* ---------------- Decisions ---------------- */

async function currentApproval(tx: Tx, requestId: string): Promise<ApprovalRow | null> {
  const [row] = await tx
    .select()
    .from(accessApprovals)
    .where(and(eq(accessApprovals.requestId, requestId), eq(accessApprovals.decision, "pending")))
    .orderBy(asc(accessApprovals.position))
    .limit(1);
  return row ?? null;
}

/**
 * After an approval: the next pending step, or — when none is left — the
 * access itself (a new grant and its provisioning job, or the extended expiry).
 */
async function advance(tx: Tx, fx: Effects, ctx: { tenant: TenantInfo; config: DeskConfig; actor: Actor }, request: RequestRow): Promise<string> {
  const tenantId = ctx.tenant.id;
  const next = await currentApproval(tx, request.id);
  const rc = await requestContext(tx, tenantId, request);
  if (next) {
    const state = stateForStep(next.step);
    await tx.update(accessRequests).set({ state, updatedAt: new Date() }).where(eq(accessRequests.id, request.id));
    await notifyApprover(tx, fx, ctx, rc, next, "new");
    return state;
  }
  const now = new Date();
  const today = dateIn(ctx.tenant.timezone);
  const app = await loadApp(tx, tenantId, request.appId, { includeArchived: true });
  if (request.extendsGrantId) {
    const expiresOn = expiryFor(today, request.durationDays);
    await tx.update(accessGrants).set({ expiresOn }).where(eq(accessGrants.id, request.extendsGrantId));
    await tx.update(accessRequests).set({ state: "active", decidedAt: now, updatedAt: now }).where(eq(accessRequests.id, request.id));
    await finishTicket(tx, tenantId, request.ticketId, "resolved");
    await writeDeskAudit(tx, tenantId, ctx.actor, "desk.grant.extended", { type: "access_request", id: request.id }, {
      app: app.name,
      date: expiresOn,
      grantId: request.extendsGrantId,
    });
    return "active";
  }
  const [existing] = await tx
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, request.personId), eq(accessGrants.appId, request.appId), isNull(accessGrants.revokedAt)));
  if (existing) {
    // Granted directly while the request was waiting: nothing left to create.
    await tx.update(accessRequests).set({ state: "active", decidedAt: now, updatedAt: now }).where(eq(accessRequests.id, request.id));
    await finishTicket(tx, tenantId, request.ticketId, "resolved");
    return "active";
  }
  await tx.update(accessRequests).set({ state: "provisioning", decidedAt: now, updatedAt: now }).where(eq(accessRequests.id, request.id));
  await createGrantTx(tx, tenantId, {
    personId: request.personId,
    app,
    tierId: request.tierId,
    requestId: request.id,
    source: "request",
    expiresOn: expiryFor(today, request.durationDays),
    actor: ctx.actor,
  });
  return "provisioning";
}

async function personOfAgent(tx: Tx, tenantId: string, userId: string): Promise<string | null> {
  const [p] = await tx.select({ id: people.id }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.userId, userId)));
  return p?.id ?? null;
}

export async function decideApproval(
  tenantId: string,
  approvalId: string,
  decision: "approved" | "refused",
  comment: string | null,
  via: DecisionChannel,
  actor: Actor,
): Promise<{ state: string }> {
  return inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const [approval] = await tx.select().from(accessApprovals).where(and(eq(accessApprovals.tenantId, tenantId), eq(accessApprovals.id, approvalId)));
    if (!approval) throw new DeskNotFoundError("approval");
    const [request] = await tx.select().from(accessRequests).where(eq(accessRequests.id, approval.requestId));
    if (!request) throw new DeskNotFoundError("request");
    if (approval.decision !== "pending" || !(AWAITING_STATES as readonly string[]).includes(request.state)) throw new DeskValidationError("invalid_state");
    const current = await currentApproval(tx, request.id);
    if (current?.id !== approval.id) throw new DeskValidationError("not_current_step");

    // Only the designated approver decides — or an admin, explicitly, and the journal says so.
    let byAgent = false;
    if (actor.kind === "person") {
      if (actor.personId === request.personId) throw new DeskForbiddenError("self_approval");
      if (actor.personId !== approval.approverPersonId) throw new DeskForbiddenError("not_approver");
    } else if (actor.kind === "agent") {
      const role = await agentRole(tx, tenantId, actor.userId);
      if (role !== "owner" && role !== "admin") throw new DeskForbiddenError("not_approver");
      const own = await personOfAgent(tx, tenantId, actor.userId);
      if (own && own === request.personId) throw new DeskForbiddenError("self_approval");
      byAgent = own === null || own !== approval.approverPersonId;
    } else {
      throw new DeskForbiddenError("not_approver");
    }

    const now = new Date();
    const text = comment?.trim() || null;
    await tx.update(accessApprovals).set({ decision, comment: text, via, decidedAt: now }).where(eq(accessApprovals.id, approval.id));
    const names = await namesOf(tx, tenantId, [approval.approverPersonId, approval.onBehalfOfPersonId]);
    const approverName = approval.approverPersonId ? (names.get(approval.approverPersonId)?.name ?? null) : null;
    const onBehalfName = !byAgent && approval.onBehalfOfPersonId ? (names.get(approval.onBehalfOfPersonId)?.name ?? null) : null;
    const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
    const ctx = { tenant, config, actor };
    const detail = {
      step: approval.step as ApprovalStepName,
      merged: approval.mergedSteps.includes("owner"),
      mergedSteps: approval.mergedSteps,
      approver: approverName,
      onBehalf: onBehalfName,
      byAgent,
      comment: text,
      via,
      approvalId: approval.id,
    };

    if (decision === "approved") {
      await writeDeskAudit(tx, tenantId, actor, "desk.approval.approved", { type: "access_request", id: request.id }, detail);
      return { state: await advance(tx, fx, ctx, request) };
    }

    await tx
      .update(accessApprovals)
      .set({ decision: "skipped" })
      .where(and(eq(accessApprovals.requestId, request.id), eq(accessApprovals.decision, "pending")));
    await tx
      .update(accessRequests)
      .set({ state: "refused", stoppedAtState: request.state, decidedAt: now, updatedAt: now })
      .where(eq(accessRequests.id, request.id));
    await finishTicket(tx, tenantId, request.ticketId, "resolved");
    await writeDeskAudit(tx, tenantId, actor, "desk.approval.refused", { type: "access_request", id: request.id }, detail);
    const rc = await requestContext(tx, tenantId, request);
    const requester = (await namesOf(tx, tenantId, [request.personId])).get(request.personId);
    if (requester) {
      const who = (await actorName(tx, actor)) ?? approverName ?? "—";
      queueNotification(fx, tenant, config, {
        event: "request_decided",
        to: { email: requester.email, name: requester.name },
        subject: ["desk.domain.mail.refusedSubject", { app: rc.appName }],
        lines: [["desk.domain.mail.refusedBody", { app: rc.appName, tier: rc.tierName, approver: who }]],
        quote: text,
        button: ["desk.domain.mail.buttonMyAccess", "/desk/mine"],
      });
    }
    return { state: "refused" };
  });
}

/* ---------------- Cancellation, reminders ---------------- */

export async function cancelAccessRequest(tenantId: string, requestId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const [request] = await tx.select().from(accessRequests).where(and(eq(accessRequests.tenantId, tenantId), eq(accessRequests.id, requestId)));
    if (!request) throw new DeskNotFoundError("request");
    if (actor.kind === "person") {
      if (actor.personId !== request.personId) throw new DeskForbiddenError("not_requester");
    } else if (actor.kind === "agent") {
      const role = await agentRole(tx, tenantId, actor.userId);
      if (!role || role === "viewer") throw new DeskForbiddenError("agent_only");
    } else throw new DeskForbiddenError("forbidden");
    // Not once provisioning has started: the account may already exist.
    if (!(AWAITING_STATES as readonly string[]).includes(request.state)) throw new DeskValidationError("invalid_state");

    const pendingApprovals = await tx
      .select()
      .from(accessApprovals)
      .where(and(eq(accessApprovals.requestId, request.id), eq(accessApprovals.decision, "pending")));
    const now = new Date();
    await tx.update(accessApprovals).set({ decision: "skipped" }).where(and(eq(accessApprovals.requestId, request.id), eq(accessApprovals.decision, "pending")));
    await tx.update(accessRequests).set({ state: "cancelled", stoppedAtState: request.state, decidedAt: now, updatedAt: now }).where(eq(accessRequests.id, request.id));
    await finishTicket(tx, tenantId, request.ticketId, "closed");
    await writeDeskAudit(tx, tenantId, actor, "desk.request.cancelled", { type: "access_request", id: request.id }, { stoppedAtState: request.state });

    // The approver who was waiting on it is told (design: "approvers are informed").
    const current = pendingApprovals.sort((a, b) => a.position - b.position)[0];
    if (current?.approverPersonId) {
      const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
      const rc = await requestContext(tx, tenantId, request);
      const approver = (await namesOf(tx, tenantId, [current.approverPersonId])).get(current.approverPersonId);
      if (approver) {
        queueNotification(fx, tenant, config, {
          event: "request_to_approve",
          to: { email: approver.email, name: approver.name },
          subject: ["desk.domain.mail.cancelledSubject", { app: rc.appName, requester: rc.requesterName }],
          lines: [["desk.domain.mail.cancelledBody", { app: rc.appName, tier: rc.tierName, requester: rc.requesterName }]],
        });
      }
    }
  });
}

/** A manual reminder (IT, or the requester). Journaled, and the approver is emailed. */
export async function remindApprover(tenantId: string, requestId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx, fx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const [request] = await tx.select().from(accessRequests).where(and(eq(accessRequests.tenantId, tenantId), eq(accessRequests.id, requestId)));
    if (!request) throw new DeskNotFoundError("request");
    if (actor.kind === "person" && actor.personId !== request.personId) throw new DeskForbiddenError("not_requester");
    if (actor.kind === "agent") {
      const role = await agentRole(tx, tenantId, actor.userId);
      if (!role || role === "viewer") throw new DeskForbiddenError("agent_only");
    }
    if (!(AWAITING_STATES as readonly string[]).includes(request.state)) throw new DeskValidationError("invalid_state");
    const current = await currentApproval(tx, request.id);
    if (!current?.approverPersonId) throw new DeskValidationError("invalid_state");
    await remindTx(tx, fx, tenantId, request, current, actor, false);
  });
}

export async function remindTx(tx: Tx, fx: Effects, tenantId: string, request: RequestRow, approval: ApprovalRow, actor: Actor, automatic: boolean): Promise<void> {
  const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
  await tx.update(accessApprovals).set({ remindedAt: new Date() }).where(eq(accessApprovals.id, approval.id));
  const rc = await requestContext(tx, tenantId, request);
  const approver = (await namesOf(tx, tenantId, [approval.approverPersonId])).get(approval.approverPersonId!);
  await notifyApprover(tx, fx, { tenant, config, actor }, rc, approval, "reminder");
  await writeDeskAudit(tx, tenantId, actor, "desk.approval.reminded", { type: "access_request", id: request.id }, {
    approver: approver?.name ?? null,
    automatic,
    approvalId: approval.id,
    ...(automatic ? { actor: null } : {}),
  });
}

export { requestContext, currentApproval };
export type { RequestContext };
