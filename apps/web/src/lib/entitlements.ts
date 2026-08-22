/**
 * Workspace entitlements (ST-02/11/12/13/14) — resolved from its own row.
 *
 * Standalone, the install has the full core with no ceiling. Driven by a
 * control plane, the workspace carries its entitlements and subscription in
 * denormalised columns: the product reads them, never computes them, and falls
 * back to the core when they are missing — a control plane outage must not
 * close the product down.
 */
import { and, count, eq, ne } from "drizzle-orm";
import { CORE_ENTITLEMENTS, isSelfHosted, type Entitlements } from "@openhelpdesk/config";
import { db, tenants, users } from "@openhelpdesk/db";

type TenantRow = typeof tenants.$inferSelect;

/** The slice of the tenant row the gating needs. */
export type TenantPlanInfo = Pick<TenantRow, "status" | "entitlements" | "planName" | "billing">;

export type { Entitlements };

/** Subscription denormalised by the control plane, absent standalone. */
export type TenantBilling = {
  /** Billable seats subscribed. */
  seats?: number;
  /** Seats included at no extra cost. */
  includedSeats?: number;
  interval?: "month" | "year";
  seatPriceCents?: number;
  currency?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  /** Deadline to settle a pending payment. */
  dunningDeadline?: string;
};

export function billingOf(tenant: TenantPlanInfo): TenantBilling {
  return (tenant.billing as TenantBilling | null) ?? {};
}

export function entitlementsFor(tenant: TenantPlanInfo): Entitlements {
  if (isSelfHosted()) return CORE_ENTITLEMENTS;
  const resolved = tenant.entitlements as Partial<Entitlements> | null;
  // Tolerant merge: an entitlement added to the type after resolution keeps its
  // default instead of vanishing.
  return resolved ? { ...CORE_ENTITLEMENTS, ...resolved } : CORE_ENTITLEMENTS;
}

/**
 * Applicable seat ceiling: none standalone; otherwise the entitlement's, or the
 * subscribed seats. A seat counts agents that are not disabled and not viewers
 * (ST-02 — an invitation reserves its own).
 */
export function seatLimitFor(tenant: TenantPlanInfo): number | null {
  if (isSelfHosted()) return null;
  const ent = entitlementsFor(tenant);
  return ent.maxAgents ?? billingOf(tenant).seats ?? null;
}

/** Occupied seats — the canonical ST-02 definition, shared by ST-02 and ST-11. */
export async function occupiedSeats(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(eq(users.tenantId, tenantId), ne(users.status, "disabled"), ne(users.role, "viewer")),
    );
  return row?.n ?? 0;
}

/**
 * Subscription label shown in ST-11: whatever the control plane wrote, or null
 * — the product invents none.
 */
export function subscriptionLabel(tenant: TenantPlanInfo): string | null {
  return tenant.planName;
}
