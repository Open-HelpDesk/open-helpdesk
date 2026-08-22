"use server";

/**
 * ST-11 — actions billing : le produit ne parle jamais à Stripe directement,
 * il demande une URL de session à la gateway privée et redirige.
 */
import { redirect } from "next/navigation";
import { occupiedSeats } from "@/lib/entitlements";
import { checkoutUrl, portalUrl } from "@/lib/cloud-gateway";
import { requireManager } from "../guard";

/** « Changer d'offre » : checkout Team (mensuel) dimensionné sur les sièges occupés. */
export async function goCheckout() {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");
  const seats = Math.max(1, await occupiedSeats(tenant.id));
  const url = await checkoutUrl({
    tenantSlug: tenant.slug,
    planId: "team",
    interval: "month",
    seats,
  });
  if (!url) redirect("/app/settings/billing?error=gateway");
  redirect(url);
}

/** « Gérer les sièges » / moyen de paiement / factures / résiliation : Customer Portal. */
export async function goPortal() {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");
  const url = await portalUrl(tenant.slug);
  if (!url) redirect("/app/settings/billing?error=gateway");
  redirect(url);
}
