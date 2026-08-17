/**
 * Entitlements par plan (ST-11/12/13/14) — résolution côté web à partir de
 * tenant.plan. La vérité des quotas vit dans cloud.plans (CO-06) ; ici on
 * applique les défauts de @openhelpdesk/config.
 */
import {
  DEFAULT_PLAN_ENTITLEMENTS,
  PLAN_IDS,
  type PlanId,
} from "@openhelpdesk/config";

export type Entitlements = (typeof DEFAULT_PLAN_ENTITLEMENTS)[PlanId];

export function planIdOf(plan: string): PlanId {
  return (PLAN_IDS as readonly string[]).includes(plan) ? (plan as PlanId) : "free";
}

export function entitlementsFor(plan: string): Entitlements {
  return DEFAULT_PLAN_ENTITLEMENTS[planIdOf(plan)];
}

/** Quota de sièges affiché : maxAgents du plan, sinon 10 par défaut (ST-02/ST-11). */
export const DEFAULT_SEAT_QUOTA = 10;

export function seatQuota(ent: Entitlements): number {
  return ent.maxAgents ?? DEFAULT_SEAT_QUOTA;
}

/** Libellés & prix des plans — verbatim design (ST-11). */
export const PLAN_LABELS: Record<PlanId, { name: string; priceLine: string }> = {
  free: { name: "Plan Free", priceLine: "0 € — 3 sièges inclus" },
  standard: { name: "Plan Standard", priceLine: "12 € par siège et par mois" },
  pro: { name: "Plan Pro", priceLine: "39 € par siège et par mois" },
};

/** Stockage inclus affiché dans ST-11 (20 Go). */
export const STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;
