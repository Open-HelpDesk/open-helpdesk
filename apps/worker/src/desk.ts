/**
 * Service desk jobs (spec 19): the core sweeps of @openhelpdesk/desk and the
 * ee/ jobs of @openhelpdesk/ee-desk.
 *
 * Importing this module registers the ee/ extensions (connectors, budgets,
 * governance) and the rules engine hook on desk tickets — the worker is one of
 * the two applications that must, apps/web being the other.
 */
import { inArray } from "drizzle-orm";
import { CORE_ENTITLEMENTS, isSelfHosted, type Entitlements } from "@openhelpdesk/config";
import { db, tenants } from "@openhelpdesk/db";
import {
  registerDeskExtensions,
  registerDeskTicketHooks,
  runProvisioningJobs,
  sweepApprovalReminders,
  sweepGrantExpiries,
} from "@openhelpdesk/desk";
import { discoverShadowIt, eeDeskExtensions, executeDueLifecyclePlans, syncLastSeen } from "@openhelpdesk/ee-desk";
import { onTicketCreated } from "@openhelpdesk/rules";

registerDeskExtensions(eeDeskExtensions);
// A desk request is a ticket: the same triggers and SLA policies run on it.
registerDeskTicketHooks({ onTicketCreated });

/** Workspaces (active or trialing) holding every given entitlement — same resolution as apps/web. */
export async function tenantsWith(...keys: Array<keyof Entitlements>): Promise<string[]> {
  const rows = await db
    .select({ id: tenants.id, entitlements: tenants.entitlements })
    .from(tenants)
    .where(inArray(tenants.status, ["active", "trial"]));
  return rows
    .filter((row) => {
      const ent: Entitlements = isSelfHosted()
        ? CORE_ENTITLEMENTS
        : { ...CORE_ENTITLEMENTS, ...((row.entitlements as Partial<Entitlements> | null) ?? {}) };
      return keys.every((k) => !!ent[k]);
    })
    .map((row) => row.id);
}

/** Runs `fn` for each workspace; one workspace failing does not stop the others. */
async function perTenant(label: string, ids: string[], fn: (tenantId: string) => Promise<unknown>): Promise<number> {
  let failed = 0;
  for (const id of ids) {
    try {
      await fn(id);
    } catch (err) {
      failed++;
      console.error(`[${label}] workspace ${id}:`, err instanceof Error ? err.message : err);
    }
  }
  return failed;
}

export const deskProcessors = {
  "desk-provisioning": async () => {
    const out = await runProvisioningJobs();
    if (out.done || out.failed || out.manual) {
      console.log(`[desk-provisioning] ${out.done} done, ${out.failed} handed to IT after failures, ${out.manual} manual`);
    }
  },
  "desk-approvals": async () => {
    const out = await sweepApprovalReminders();
    if (out.reminded || out.escalated) console.log(`[desk-approvals] ${out.reminded} reminded, ${out.escalated} escalated`);
  },
  "desk-expiries": async () => {
    const out = await sweepGrantExpiries();
    if (out.notified || out.revoked) console.log(`[desk-expiries] ${out.notified} reminded, ${out.revoked} revoked`);
  },
  "desk-lifecycle": async () => {
    const out = await executeDueLifecyclePlans();
    if (out.executed) console.log(`[desk-lifecycle] ${out.executed} plan(s) executed`);
  },
  "desk-last-seen": async () => {
    const ids = await tenantsWith("serviceDesk", "deskConnectors");
    const failed = await perTenant("desk-last-seen", ids, syncLastSeen);
    // Rethrown as a whole so the failure shows in the queue metric, after every workspace had its turn.
    if (failed) throw new Error(`${failed} workspace(s) failed`);
  },
  "desk-shadow": async () => {
    const ids = await tenantsWith("serviceDesk", "deskShadowIt");
    const failed = await perTenant("desk-shadow", ids, discoverShadowIt);
    if (failed) throw new Error(`${failed} workspace(s) failed`);
  },
};
