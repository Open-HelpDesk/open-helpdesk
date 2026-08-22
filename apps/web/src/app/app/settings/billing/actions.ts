"use server";

/**
 * ST-11 — the product knows neither plan nor payment provider: it asks its
 * control plane for a session URL and redirects to it.
 */
import { redirect } from "next/navigation";
import { occupiedSeats } from "@/lib/entitlements";
import { checkoutUrl, portalUrl } from "@/lib/control-plane";
import { requireManager } from "../guard";

/** "Change plan": subscription session sized on the occupied seats. */
export async function goCheckout() {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");
  const seats = Math.max(1, await occupiedSeats(tenant.id));
  const url = await checkoutUrl({ tenantSlug: tenant.slug, seats });
  if (!url) redirect("/app/settings/billing?error=gateway");
  redirect(url);
}

/** "Manage seats" / payment method / invoices / cancellation: Customer Portal. */
export async function goPortal() {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");
  const url = await portalUrl(tenant.slug);
  if (!url) redirect("/app/settings/billing?error=gateway");
  redirect(url);
}
