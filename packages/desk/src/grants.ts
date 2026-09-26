/**
 * Access actually held (spec 19 §3.1, §4 rule 4 — withdrawal is a product):
 * creation, direct assignment, return, revocation, expiry.
 *
 * A grant row exists from the moment the access is decided; it is LIVE once
 * its `create` provisioning job is done (grantedAt is then reset to that
 * moment). A grant whose create job is still queued / running / manual is an
 * access being created, not an access held.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { accessGrants, accessRequests, deskApps, deskAppTiers, people, provisioningJobs, type Tx } from "@openhelpdesk/db";
import { writeDeskAudit } from "./audit";
import { loadApp, loadPerson, loadTier, type AppRow } from "./circuit-db";
import type { DeskConfig } from "./config";
import { DeskForbiddenError, DeskNotFoundError, DeskValidationError } from "./errors";
import { addDays, dateIn, inTenant, loadConfig, requireAgent, requireEntitlement, requireNotPerson, tenantInfo } from "./internal";
import { queueJob } from "./provisioning";
import type { Actor } from "./types";

type GrantRow = typeof accessGrants.$inferSelect;

export function expiryFor(today: string, durationDays: number | null): string | null {
  return durationDays ? addDays(today, durationDays) : null;
}

/** Creates the grant and its `create` job. */
export async function createGrantTx(
  tx: Tx,
  tenantId: string,
  opts: {
    personId: string;
    app: AppRow;
    tierId: string;
    requestId: string | null;
    source: "request" | "direct" | "onboarding" | "import" | "scim";
    expiresOn: string | null;
    actor: Actor;
    /** Journal lines that must precede the provisioning line (decision order). */
    beforeJob?: (grantId: string) => Promise<void>;
  },
): Promise<{ grantId: string; jobState: "queued" | "manual" }> {
  const [grant] = await tx
    .insert(accessGrants)
    .values({
      tenantId,
      personId: opts.personId,
      appId: opts.app.id,
      tierId: opts.tierId,
      requestId: opts.requestId,
      source: opts.source,
      expiresOn: opts.expiresOn,
    })
    .returning({ id: accessGrants.id });
  if (opts.beforeJob) await opts.beforeJob(grant!.id);
  const job = await queueJob(tx, tenantId, { grantId: grant!.id, requestId: opts.requestId, action: "create", app: opts.app, actor: opts.actor });
  return { grantId: grant!.id, jobState: job.state };
}

/**
 * Ends a grant and removes the account per `directory.deprovision`:
 * disable now then delete after N days, or one of the two. An account that
 * was never created is not removed — its pending creation is cancelled.
 */
export async function endGrantTx(
  tx: Tx,
  tenantId: string,
  grant: GrantRow,
  config: DeskConfig,
  opts: { reason: string; actor: Actor },
): Promise<void> {
  const now = new Date();
  await tx.update(accessGrants).set({ revokedAt: now, revokeReason: opts.reason, revokeScheduledAt: null }).where(eq(accessGrants.id, grant.id));

  const open = await tx
    .select({ id: provisioningJobs.id })
    .from(provisioningJobs)
    .where(and(eq(provisioningJobs.grantId, grant.id), eq(provisioningJobs.action, "create"), inArray(provisioningJobs.state, ["queued", "running", "manual", "failed"])));
  if (open.length) {
    await tx.update(provisioningJobs).set({ state: "cancelled", updatedAt: now }).where(inArray(provisioningJobs.id, open.map((j) => j.id)));
    if (grant.requestId) {
      await tx
        .update(accessRequests)
        .set({ state: "cancelled", stoppedAtState: "provisioning", updatedAt: now })
        .where(and(eq(accessRequests.id, grant.requestId), inArray(accessRequests.state, ["provisioning", "provisioning_failed"])));
    }
    return;
  }

  const [app] = await tx.select().from(deskApps).where(eq(deskApps.id, grant.appId));
  if (!app) return;
  const policy = config.directory.deprovision;
  const first = await queueJob(tx, tenantId, {
    grantId: grant.id,
    requestId: null,
    action: policy === "delete" ? "delete" : "disable",
    app,
    actor: opts.actor,
  });
  // The deferred deletion only makes sense for a connector; IT handles a manual app in one task.
  if (policy === "disable_then_delete" && first.state === "queued") {
    await queueJob(tx, tenantId, {
      grantId: grant.id,
      requestId: null,
      action: "delete",
      app,
      actor: opts.actor,
      runAfter: new Date(now.getTime() + config.directory.deleteAfterDays * 86_400_000),
    });
  }
}

async function loadActiveGrant(tx: Tx, tenantId: string, grantId: string): Promise<GrantRow> {
  const [grant] = await tx.select().from(accessGrants).where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.id, grantId)));
  if (!grant) throw new DeskNotFoundError("grant");
  if (grant.revokedAt) throw new DeskValidationError("invalid_state");
  return grant;
}

async function grantNames(tx: Tx, grant: GrantRow) {
  const [app] = await tx.select({ name: deskApps.name }).from(deskApps).where(eq(deskApps.id, grant.appId));
  const [tier] = await tx.select({ name: deskAppTiers.name }).from(deskAppTiers).where(eq(deskAppTiers.id, grant.tierId));
  const [person] = await tx.select({ name: people.name }).from(people).where(eq(people.id, grant.personId));
  return { app: app?.name ?? "—", tier: tier?.name ?? "—", person: person?.name ?? "—" };
}

/** The employee gives an access back — the seat returns to the pool. */
export async function returnAccess(tenantId: string, grantId: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    const grant = await loadActiveGrant(tx, tenantId, grantId);
    if (actor.kind !== "person" || actor.personId !== grant.personId) throw new DeskForbiddenError("not_requester");
    const config = await loadConfig(tx, tenantId);
    const names = await grantNames(tx, grant);
    await endGrantTx(tx, tenantId, grant, config, { reason: "returned", actor });
    await writeDeskAudit(tx, tenantId, actor, "desk.grant.returned", { type: "access_grant", id: grant.id }, { app: names.app, tier: names.tier, person: names.person });
  });
}

/** Revocation by IT (or by a rule / ee job: review closure, reclaim, offboarding). */
export async function revokeAccess(tenantId: string, grantId: string, reason: string, actor: Actor): Promise<void> {
  await inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    if (actor.kind === "agent") await requireAgent(tx, tenantId, actor);
    else requireNotPerson(actor);
    const grant = await loadActiveGrant(tx, tenantId, grantId);
    const config = await loadConfig(tx, tenantId);
    const names = await grantNames(tx, grant);
    await endGrantTx(tx, tenantId, grant, config, { reason: reason || "revoked", actor });
    await writeDeskAudit(tx, tenantId, actor, "desk.grant.revoked", { type: "access_grant", id: grant.id }, { app: names.app, tier: names.tier, person: names.person, reason: reason || null });
  });
}

/** Direct assignment by an agent: bypasses the circuit, and says so in the journal. */
export async function directGrant(
  tenantId: string,
  personId: string,
  appId: string,
  tierId: string,
  durationDays: number | null,
  actor: Actor,
  opts: { source?: "direct" | "onboarding" } = {},
): Promise<string> {
  const source = opts.source ?? "direct";
  return inTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "serviceDesk");
    await requireAgent(tx, tenantId, actor);
    if (durationDays !== null && !(Number.isInteger(durationDays) && durationDays > 0)) throw new DeskValidationError("invalid_input", "durationDays");
    const [app, person, tenant] = await Promise.all([loadApp(tx, tenantId, appId), loadPerson(tx, tenantId, personId), tenantInfo(tx, tenantId)]);
    const tier = await loadTier(tx, tenantId, appId, tierId);
    if (person.status === "departed") throw new DeskValidationError("invalid_state");
    const [active] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, personId), eq(accessGrants.appId, appId), isNull(accessGrants.revokedAt)));
    if (active) throw new DeskValidationError("active_grant");
    const expiresOn = expiryFor(dateIn(tenant.timezone), durationDays);
    const { grantId } = await createGrantTx(tx, tenantId, {
      personId,
      app,
      tierId: tier.id,
      requestId: null,
      source,
      expiresOn,
      actor,
      // Doctrine rule 1: the bypass is written, and before the provisioning line.
      beforeJob: (id) =>
        writeDeskAudit(tx, tenantId, actor, "desk.grant.direct", { type: "access_grant", id }, { person: person.name, app: app.name, tier: tier.name, durationDays, expiresOn, source }),
    });
    return grantId;
  });
}

