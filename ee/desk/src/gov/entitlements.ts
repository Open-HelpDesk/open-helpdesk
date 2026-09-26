/**
 * Entitlement gate for the ee/ half of the service desk.
 *
 * Same resolution as apps/web/src/lib/entitlements.ts (`entitlementsFor`):
 * self-hosted → the core set; driven by a control plane → the tenant row's
 * entitlements merged over the core set, so a key added later keeps its default
 * and a control plane outage never opens nor closes more than the core.
 *
 * Duplicated here on purpose: ee/desk runs in the worker too, where the web
 * app's lib is not importable.
 */
import { eq } from "drizzle-orm";
import { CORE_ENTITLEMENTS, isSelfHosted, type Entitlements } from "@openhelpdesk/config";
import { tenants, type Tx } from "@openhelpdesk/db";

export type DeskEeEntitlement =
  | "deskConnectors"
  | "deskLicences"
  | "deskAccessReviews"
  | "deskLifecycle"
  | "deskBudgets"
  | "deskGovernance"
  | "deskShadowIt";

/** Thrown when a tenant calls an ee/ desk function it is not entitled to. */
export class DeskEeEntitlementError extends Error {
  readonly code = "desk_ee_entitlement";
  constructor(
    readonly entitlement: DeskEeEntitlement,
    readonly tenantId: string,
  ) {
    super(`This workspace is not entitled to ${entitlement}`);
    this.name = "DeskEeEntitlementError";
  }
}

/** Pure resolution, from the tenant row's `entitlements` column. */
export function resolveEntitlements(stored: unknown): Entitlements {
  if (isSelfHosted()) return CORE_ENTITLEMENTS;
  const resolved = stored as Partial<Entitlements> | null | undefined;
  return resolved ? { ...CORE_ENTITLEMENTS, ...resolved } : CORE_ENTITLEMENTS;
}

export async function tenantEntitlements(tx: Tx, tenantId: string): Promise<Entitlements> {
  const [row] = await tx
    .select({ entitlements: tenants.entitlements })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return resolveEntitlements(row?.entitlements ?? null);
}

export async function hasEntitlement(tx: Tx, tenantId: string, key: DeskEeEntitlement): Promise<boolean> {
  const ent = await tenantEntitlements(tx, tenantId);
  return ent[key] === true;
}

export async function requireEntitlement(tx: Tx, tenantId: string, key: DeskEeEntitlement): Promise<void> {
  if (!(await hasEntitlement(tx, tenantId, key))) throw new DeskEeEntitlementError(key, tenantId);
}

/** Domain errors of the ee/ desk (bad input, wrong state) — distinct from the entitlement refusal. */
export class DeskEeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DeskEeError";
  }
}
