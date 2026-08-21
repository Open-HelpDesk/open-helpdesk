/**
 * Entitlements par plan (ST-11/12/13/14) — résolution côté web à partir de
 * tenant.plan. La vérité des quotas vit dans cloud.plans (CO-06) ; ici on
 * applique les défauts de @openhelpdesk/config.
 */
import {
  DEFAULT_PLAN_ENTITLEMENTS,
  PLAN_IDS,
  SELF_HOSTED_ENTITLEMENTS,
  isSelfHosted,
  type PlanId,
} from "@openhelpdesk/config";
import type { MessageKey } from "@/i18n/dictionaries/fr";

export type Entitlements = (typeof DEFAULT_PLAN_ENTITLEMENTS)[PlanId];

export function planIdOf(plan: string): PlanId {
  return (PLAN_IDS as readonly string[]).includes(plan) ? (plan as PlanId) : "free";
}

export function entitlementsFor(plan: string): Entitlements {
  if (isSelfHosted()) return SELF_HOSTED_ENTITLEMENTS;
  return DEFAULT_PLAN_ENTITLEMENTS[planIdOf(plan)];
}

/** Quota de sièges affiché : maxAgents du plan, sinon 10 par défaut (ST-02/ST-11). */
export const DEFAULT_SEAT_QUOTA = 10;

export function seatQuota(ent: Entitlements): number {
  return ent.maxAgents ?? DEFAULT_SEAT_QUOTA;
}

/**
 * Limite de sièges applicable : null en auto-hébergé (illimité), sinon le
 * quota du plan cloud. Le siège compte les agents actifs hors viewer
 * (ST-02 — une invitation réserve son siège).
 */
export function seatLimitFor(plan: string): number | null {
  if (isSelfHosted()) return null;
  return seatQuota(DEFAULT_PLAN_ENTITLEMENTS[planIdOf(plan)]);
}

/**
 * Nom de l'offre affiché en ST-11 — une CLÉ, pas un libellé.
 *
 * La table portait aussi une ligne de prix (« 12 € par siège et par mois ») que
 * plus personne n'affichait : l'écran la recompose depuis SEAT_PRICE et les clés
 * `seatPricing` / `seatsIncluded`, déjà traduites. Elle est retirée plutôt que
 * traduite.
 */
export const PLAN_NAME_KEYS: Record<PlanId, MessageKey> = {
  free: "app.settings.workspace.planFree",
  standard: "app.settings.workspace.planStandard",
  pro: "app.settings.workspace.planPro",
};

/** Stockage inclus affiché dans ST-11 (20 Go). */
export const STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;
