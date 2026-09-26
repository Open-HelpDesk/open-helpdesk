/**
 * Account creation and removal (spec 19 §7, §9).
 *
 * A job is created for every grant that needs an account touched. When the
 * app is covered by a healthy connector with a provisioner, the worker runs it
 * (`runProvisioningJobs`); otherwise the job is a task for the IT team from
 * the start (state `manual`, the "To create" list of SD-A1). A connector that
 * fails three times hands its job to IT too, and says why in the journal:
 * never silent (doctrine rule 5).
 */
import { and, asc, eq, inArray, lt, lte } from "drizzle-orm";
import { decryptSecret } from "@openhelpdesk/crypto";
import {
  accessGrants,
  accessRequests,
  db,
  deskApps,
  deskAppTiers,
  people,
  provisioningJobs,
  users,
  type Tx,
} from "@openhelpdesk/db";
import { connectorLabel, writeDeskAudit } from "./audit";
import { provisioningModeFor, type AppRow } from "./circuit-db";
import type { DeskConfig } from "./config";
import { DeskNotFoundError, DeskValidationError } from "./errors";
import { deskExtensions } from "./extensions";
import { inTenant, loadConfig, requireAgent, tenantInfo, type Effects, type TenantInfo } from "./internal";
import { queueNotification } from "./notify";
import { finishTicket } from "./tickets";
import type { Actor, ConnectorKind, ProvisionInput } from "./types";

export type JobAction = "create" | "update" | "disable" | "delete";
export const MAX_ATTEMPTS = 3;
/** Wait before attempt n+1, after n failures. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000];

type JobRow = typeof provisioningJobs.$inferSelect;

/** The journal target of a job: the request when there is one, the grant otherwise. */
function jobTarget(job: { requestId: string | null; grantId: string }) {
  return job.requestId ? { type: "access_request" as const, id: job.requestId } : { type: "access_grant" as const, id: job.grantId };
}

/**
 * Creates a provisioning job. Automatic only when the connector is healthy AND
 * a provisioner exists; otherwise it is an IT task from the start, journaled.
 */
export async function queueJob(
  tx: Tx,
  tenantId: string,
  opts: { grantId: string; requestId: string | null; action: JobAction; app: Pick<AppRow, "connectorId">; actor: Actor; runAfter?: Date },
): Promise<{ jobId: string; state: "queued" | "manual"; kind: ConnectorKind }> {
  const mode = await provisioningModeFor(tx, tenantId, opts.app);
  const state = mode.automatic ? "queued" : "manual";
  const [job] = await tx
    .insert(provisioningJobs)
    .values({
      tenantId,
      grantId: opts.grantId,
      requestId: opts.requestId,
      action: opts.action,
      state,
      connectorKind: mode.kind,
      runAfter: opts.runAfter ?? new Date(),
    })
    .returning({ id: provisioningJobs.id });
  if (state === "manual") {
    await writeDeskAudit(tx, tenantId, opts.actor, "desk.provisioning.manual_task", jobTarget(opts), {
      action: opts.action,
      reason: mode.kind === "manual" ? "manual" : "connector_unavailable",
      connector: mode.kind,
      jobId: job!.id,
      grantId: opts.grantId,
    });
  }
  return { jobId: job!.id, state, kind: mode.kind };
}

async function personRecipient(tx: Tx, tenantId: string, personId: string) {
  const [p] = await tx.select({ email: people.email, name: people.name }).from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
  return p ?? null;
}

async function appAndTierNames(tx: Tx, grant: { appId: string; tierId: string }) {
  const [app] = await tx.select({ name: deskApps.name }).from(deskApps).where(eq(deskApps.id, grant.appId));
  const [tier] = await tx.select({ name: deskAppTiers.name }).from(deskAppTiers).where(eq(deskAppTiers.id, grant.tierId));
  return { app: app?.name ?? "—", tier: tier?.name ?? "—" };
}

/**
 * A job is done — by the connector, or ticked by IT. For a creation, the grant
 * goes live now: its request becomes active, the ticket is resolved and the
 * holder is told.
 */
export async function completeJob(
  tx: Tx,
  fx: Effects,
  ctx: { tenant: TenantInfo; config: DeskConfig },
  job: JobRow,
  opts: { actor: Actor; manual: boolean; externalAccountId?: string | null },
): Promise<void> {
  const tenantId = ctx.tenant.id;
  const now = new Date();
  await tx
    .update(provisioningJobs)
    .set({ state: "done", updatedAt: now, lastError: opts.manual ? job.lastError : null, doneByUserId: opts.actor.kind === "agent" ? opts.actor.userId : null })
    .where(eq(provisioningJobs.id, job.id));
  const [grant] = await tx.select().from(accessGrants).where(eq(accessGrants.id, job.grantId));
  if (!grant) return;
  const names = await appAndTierNames(tx, grant);
  if (job.action === "create") {
    await tx
      .update(accessGrants)
      .set({ grantedAt: now, ...(opts.externalAccountId ? { externalAccountId: opts.externalAccountId } : {}) })
      .where(eq(accessGrants.id, grant.id));
    if (job.requestId) {
      const [request] = await tx.select().from(accessRequests).where(eq(accessRequests.id, job.requestId));
      if (request && (request.state === "provisioning" || request.state === "provisioning_failed")) {
        await tx.update(accessRequests).set({ state: "active", updatedAt: now }).where(eq(accessRequests.id, request.id));
        await finishTicket(tx, tenantId, request.ticketId, "resolved");
      }
    }
  }
  await writeDeskAudit(
    tx,
    tenantId,
    opts.actor,
    opts.manual ? "desk.provisioning.done_manually" : "desk.provisioning.done",
    jobTarget(job),
    { action: job.action, connector: job.connectorKind, app: names.app, jobId: job.id, grantId: grant.id },
  );
  if (job.action === "create") {
    const to = await personRecipient(tx, tenantId, grant.personId);
    if (to) {
      queueNotification(fx, ctx.tenant, ctx.config, {
        event: "access_ready",
        to,
        subject: ["desk.domain.mail.accessReadySubject", { app: names.app }],
        lines: [["desk.domain.mail.accessReadyBody", { app: names.app, tier: names.tier }]],
        button: ["desk.domain.mail.buttonMyAccess", "/desk/mine"],
      });
    }
  }
}

/** IT ticks a manual task (or a job a connector gave up on). */
export async function markProvisioned(tenantId: string, jobId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx, fx) => {
    await requireAgent(tx, tenantId, actor);
    const [job] = await tx.select().from(provisioningJobs).where(and(eq(provisioningJobs.tenantId, tenantId), eq(provisioningJobs.id, jobId)));
    if (!job) throw new DeskNotFoundError("provisioning job");
    if (job.state !== "manual" && job.state !== "failed") throw new DeskValidationError("invalid_state");
    const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
    await completeJob(tx, fx, { tenant, config }, job, { actor, manual: true });
  });
}

/* ---------------- The runner (apps/worker) ---------------- */

async function buildInput(tx: Tx, tenantId: string, job: JobRow): Promise<{ input: ProvisionInput; connectorId: string | null; appName: string } | null> {
  const [grant] = await tx.select().from(accessGrants).where(eq(accessGrants.id, job.grantId));
  if (!grant) return null;
  const [app] = await tx.select().from(deskApps).where(eq(deskApps.id, grant.appId));
  const [tier] = await tx.select().from(deskAppTiers).where(eq(deskAppTiers.id, grant.tierId));
  const [person] = await tx.select().from(people).where(eq(people.id, grant.personId));
  if (!app || !tier || !person) return null;
  return {
    connectorId: app.connectorId,
    appName: app.name,
    input: {
      tenantId,
      connectorId: app.connectorId,
      app: { id: app.id, slug: app.slug, name: app.name, scimBaseUrl: app.scimBaseUrl, scimToken: decryptSecret(app.scimToken) },
      tier: { id: tier.id, name: tier.name, externalGroup: tier.externalGroup },
      person: { id: person.id, email: person.email, name: person.name, externalId: person.externalId, department: person.department },
      externalAccountId: grant.externalAccountId,
    },
  };
}

async function adminRecipients(tx: Tx, tenantId: string) {
  return tx
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.role, ["owner", "admin"]), eq(users.status, "active")));
}

/**
 * Hand a job to IT: after the connector failed MAX_ATTEMPTS times (`failed`,
 * the request shows "manual creation in progress" and the error is journaled),
 * or because no provisioner is available any more (`unavailable`).
 */
async function handToIt(
  tx: Tx,
  fx: Effects,
  tenantId: string,
  job: JobRow,
  outcome: { kind: "failed"; error: string; attempts: number } | { kind: "unavailable" },
  appName: string,
): Promise<void> {
  const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
  const error = outcome.kind === "failed" ? outcome.error.slice(0, 1000) : "connector_unavailable";
  await tx
    .update(provisioningJobs)
    .set({ state: "manual", attempts: outcome.kind === "failed" ? outcome.attempts : job.attempts, lastError: error, updatedAt: new Date() })
    .where(eq(provisioningJobs.id, job.id));
  if (outcome.kind === "unavailable") {
    await writeDeskAudit(tx, tenantId, { kind: "system" }, "desk.provisioning.manual_task", jobTarget(job), {
      action: job.action,
      reason: "connector_unavailable",
      connector: job.connectorKind,
      jobId: job.id,
      grantId: job.grantId,
    });
    return;
  }
  if (job.requestId && job.action === "create") {
    await tx.update(accessRequests).set({ state: "provisioning_failed", updatedAt: new Date() }).where(and(eq(accessRequests.id, job.requestId), eq(accessRequests.state, "provisioning")));
  }
  await writeDeskAudit(tx, tenantId, { kind: "system" }, "desk.provisioning.failed", jobTarget(job), {
    action: job.action,
    connector: job.connectorKind,
    error: outcome.error.slice(0, 500),
    attempts: outcome.attempts,
    jobId: job.id,
    grantId: job.grantId,
  });
  for (const to of await adminRecipients(tx, tenantId)) {
    queueNotification(fx, tenant, config, {
      event: "connector_error",
      to,
      subject: ["desk.domain.mail.connectorErrorSubject", { app: appName }],
      lines: [["desk.domain.mail.connectorErrorBody", { app: appName, connector: connectorLabel(job.connectorKind) ?? job.connectorKind, error: outcome.error.slice(0, 300) }]],
      button: ["desk.domain.mail.buttonQueue", "/app/desk"],
    });
  }
}

/** A job left "running" by a crashed worker goes back to the queue after ten minutes. */
async function reclaimStale(now: Date): Promise<void> {
  await db
    .update(provisioningJobs)
    .set({ state: "queued", updatedAt: now })
    .where(and(eq(provisioningJobs.state, "running"), lt(provisioningJobs.updatedAt, new Date(now.getTime() - 10 * 60_000))));
}

export async function runProvisioningJobs(
  limit = 50,
  now: Date = new Date(),
  /** Restrict to one workspace (tests, a manual re-run). */
  opts: { tenantId?: string } = {},
): Promise<{ done: number; failed: number; manual: number }> {
  const out = { done: 0, failed: 0, manual: 0 };
  await reclaimStale(now);
  // Cross-tenant candidate scan, as the other sweeps do; each job is then handled in its tenant.
  const due = await db
    .select({ id: provisioningJobs.id, tenantId: provisioningJobs.tenantId })
    .from(provisioningJobs)
    .where(and(eq(provisioningJobs.state, "queued"), lte(provisioningJobs.runAfter, now), opts.tenantId ? eq(provisioningJobs.tenantId, opts.tenantId) : undefined))
    .orderBy(asc(provisioningJobs.runAfter))
    .limit(limit);

  for (const { id, tenantId } of due) {
    try {
      // 1. Claim, and gather everything the provisioner needs.
      const claimed = await inTenant(tenantId, async (tx) => {
        const [job] = await tx
          .update(provisioningJobs)
          .set({ state: "running", updatedAt: new Date() })
          .where(and(eq(provisioningJobs.id, id), eq(provisioningJobs.state, "queued")))
          .returning();
        if (!job) return null;
        const built = await buildInput(tx, tenantId, job);
        const ext = deskExtensions();
        const healthy = built?.connectorId && ext.connectorHealthy ? await ext.connectorHealthy(tx, tenantId, built.connectorId) : false;
        return { job, built, healthy };
      });
      if (!claimed) continue;
      const { job, built, healthy } = claimed;
      const ext = deskExtensions();
      const provisioner = built && healthy && job.connectorKind !== "manual" && ext.provisionerFor ? await ext.provisionerFor(tenantId, job.connectorKind) : null;

      // 2. No provisioner (connector down, removed, ee absent): straight to IT, with the reason.
      if (!built || !provisioner) {
        await inTenant(tenantId, (tx, fx) => handToIt(tx, fx, tenantId, job, { kind: "unavailable" }, built?.appName ?? "—"));
        out.manual++;
        continue;
      }

      // 3. Call the connector outside any transaction.
      let externalAccountId: string | null = null;
      let error: string | null = null;
      try {
        if (job.action === "create") externalAccountId = (await provisioner.create(built.input)).externalAccountId;
        else if (job.action === "update") await provisioner.update(built.input);
        else if (job.action === "disable") await provisioner.disable(built.input);
        else await provisioner.delete(built.input);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      // 4. Record the outcome.
      if (error === null) {
        await inTenant(tenantId, async (tx, fx) => {
          const [tenant, config] = await Promise.all([tenantInfo(tx, tenantId), loadConfig(tx, tenantId)]);
          await completeJob(tx, fx, { tenant, config }, { ...job, attempts: job.attempts + 1 }, { actor: { kind: "system" }, manual: false, externalAccountId });
          await tx.update(provisioningJobs).set({ attempts: job.attempts + 1 }).where(eq(provisioningJobs.id, job.id));
        });
        out.done++;
      } else {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await inTenant(tenantId, (tx, fx) => handToIt(tx, fx, tenantId, job, { kind: "failed", error: error!, attempts }, built.appName));
          out.failed++;
        } else {
          const delay = RETRY_DELAYS_MS[attempts - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
          await inTenant(tenantId, (tx) =>
            tx
              .update(provisioningJobs)
              .set({ state: "queued", attempts, lastError: error!.slice(0, 1000), runAfter: new Date(now.getTime() + delay), updatedAt: new Date() })
              .where(eq(provisioningJobs.id, job.id)),
          );
        }
      }
    } catch (err) {
      console.error(`[desk] provisioning job ${id} crashed:`, err);
    }
  }
  return out;
}
