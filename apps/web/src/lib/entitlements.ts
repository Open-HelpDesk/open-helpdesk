/**
 * Entitlements par plan (ST-11/12/13/14) — résolution côté web depuis la ligne
 * tenant. En édition cloud, la vérité vit dans le control plane privé qui
 * DÉNORMALISE le résultat sur app.tenants (colonnes entitlements/planName/
 * billing/status) : ici on lit, avec les défauts de @openhelpdesk/config en
 * repli (colonne null = tenant pas encore visité par le control plane, ou
 * panne de celui-ci). En auto-hébergé, tout le cœur est débloqué.
 */
import { and, count, eq, ne } from "drizzle-orm";
import {
  DEFAULT_PLAN_ENTITLEMENTS,
  PLAN_IDS,
  SELF_HOSTED_ENTITLEMENTS,
  isSelfHosted,
  type PlanEntitlements,
  type PlanId,
} from "@openhelpdesk/config";
import { db, tenants, users } from "@openhelpdesk/db";
import type { MessageKey } from "@/i18n/dictionaries/fr";
import type { Translate } from "@/i18n/server";

type TenantRow = typeof tenants.$inferSelect;

/** Le sous-ensemble de la ligne tenant dont le gating a besoin. */
export type TenantPlanInfo = Pick<
  TenantRow,
  "plan" | "status" | "entitlements" | "planName" | "billing"
>;

export type Entitlements = PlanEntitlements;

/** Facturation dénormalisée par le control plane (cloud uniquement). */
export type TenantBilling = {
  seats?: number;
  interval?: "month" | "year";
  seatPriceCents?: number;
  currency?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  dunningDeadline?: string;
};

export function planIdOf(plan: string): PlanId {
  return (PLAN_IDS as readonly string[]).includes(plan) ? (plan as PlanId) : "free";
}

export function billingOf(tenant: TenantPlanInfo): TenantBilling {
  return (tenant.billing as TenantBilling | null) ?? {};
}

export function entitlementsFor(tenant: TenantPlanInfo): Entitlements {
  if (isSelfHosted()) return SELF_HOSTED_ENTITLEMENTS;
  const defaults = DEFAULT_PLAN_ENTITLEMENTS[planIdOf(tenant.plan)];
  const denormalized = tenant.entitlements as Partial<PlanEntitlements> | null;
  // Merge tolérant : un champ ajouté au type après la dénormalisation garde son défaut.
  return denormalized ? { ...defaults, ...denormalized } : defaults;
}

/**
 * Limite de sièges applicable : null en auto-hébergé (illimité) ; en cloud,
 * le plafond du plan (Free) sinon les sièges achetés (Team/Enterprise).
 * Le siège compte les agents non désactivés hors viewer (ST-02 — une
 * invitation réserve son siège).
 */
export function seatLimitFor(tenant: TenantPlanInfo): number | null {
  if (isSelfHosted()) return null;
  const ent = entitlementsFor(tenant);
  return ent.maxAgents ?? billingOf(tenant).seats ?? null;
}

/** Sièges occupés — définition canonique ST-02, partagée par ST-02 et ST-11. */
export async function occupiedSeats(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(eq(users.tenantId, tenantId), ne(users.status, "disabled"), ne(users.role, "viewer")),
    );
  return row?.n ?? 0;
}

/** Nom de l'offre affiché (ST-11) — plans privés négociés inclus. */
export const PLAN_NAME_KEYS: Record<PlanId, MessageKey> = {
  free: "app.settings.workspace.planFree",
  team: "app.settings.workspace.planTeam",
  enterprise: "app.settings.workspace.planEnterprise",
};

export function planDisplayName(tenant: TenantPlanInfo, t: Translate): string {
  return tenant.planName ?? t(PLAN_NAME_KEYS[planIdOf(tenant.plan)]);
}
