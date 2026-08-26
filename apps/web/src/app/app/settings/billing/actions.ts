"use server";

/**
 * ST-11 — the product knows neither plan nor payment provider: it asks its
 * control plane for a session URL and redirects to it.
 */
import { redirect } from "next/navigation";
import { occupiedSeats } from "@/lib/entitlements";
import { checkoutUrl, portalUrl, recheckSuspension } from "@/lib/control-plane";
import { requireManager } from "../guard";

/**
 * "Change plan" / offer picker: subscription session for the chosen plan,
 * interval and seat count. Without an explicit choice (legacy button), the
 * session is sized on the occupied seats and the control plane picks the plan.
 */
export async function goCheckout(formData?: FormData) {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");

  const planId = formData?.get("planId")?.toString() || undefined;
  const rawInterval = formData?.get("interval")?.toString();
  const interval = rawInterval === "year" ? "year" : rawInterval === "month" ? "month" : undefined;
  const askedSeats = Number(formData?.get("seats"));
  // Never sell fewer seats than are occupied: the checkout would succeed and
  // the workspace would be over its own subscription on arrival.
  const occupied = Math.max(1, await occupiedSeats(tenant.id));
  const seats = Number.isFinite(askedSeats) && askedSeats > 0
    ? Math.max(Math.floor(askedSeats), occupied)
    : occupied;

  const url = await checkoutUrl({ tenantSlug: tenant.slug, seats, planId, interval });
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

/**
 * "Re-check now" (suspended workspace, non-payment excluded): the owner
 * reduced usage, the control plane recounts and lifts the suspension on the
 * spot when the workspace now fits the free allowance.
 */
export async function goRecheck() {
  const { tenant, agent } = await requireManager();
  if (agent.role !== "owner") redirect("/app/settings/billing?error=owner");
  const res = await recheckSuspension(tenant.slug);
  if (!res) redirect("/app/settings/billing?error=gateway");
  if (res.outcome === "reactivated" || res.outcome === "not_suspended") {
    redirect("/app/settings/billing?recheck=ok");
  }
  if (res.outcome === "still_over") {
    redirect(
      `/app/settings/billing?recheck=over&seats=${res.seats}&maxSeats=${res.maxSeats}&mailboxes=${res.mailboxes}&maxMailboxes=${res.maxMailboxes}`,
    );
  }
  // Unpaid: shrinking changes nothing, only the payment lifts it. Land on the
  // bare screen, which states that from the workspace's own state — claiming
  // the billing service is unreachable would be a lie.
  if (res.outcome === "unpaid") redirect("/app/settings/billing");
  redirect("/app/settings/billing?error=gateway");
}
