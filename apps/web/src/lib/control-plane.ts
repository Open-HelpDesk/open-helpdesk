/**
 * Control plane client — the product talks to no payment provider and carries
 * none of its keys: it asks its control plane for a session URL and redirects
 * the user there. Inert without CLOUD_GATEWAY_URL, that is, in every
 * standalone install.
 */
export function gatewayConfigured(): boolean {
  return Boolean(process.env.CLOUD_GATEWAY_URL && process.env.CLOUD_GATEWAY_SECRET);
}

async function call<T>(path: string, body: unknown): Promise<T | null> {
  if (!gatewayConfigured()) return null;
  try {
    const res = await fetch(`${process.env.CLOUD_GATEWAY_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CLOUD_GATEWAY_SECRET}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[gateway] ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[gateway] ${path} injoignable :`, err);
    return null;
  }
}

/**
 * Subscription session: the product passes the workspace and the owner's
 * choice (plan id as named by the control plane, billing interval, seats) —
 * what those cost belongs to the control plane.
 */
export async function checkoutUrl(input: {
  tenantSlug: string;
  seats: number;
  planId?: string;
  interval?: "month" | "year";
}): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/checkout-session", input);
  return res?.url ?? null;
}

export async function portalUrl(tenantSlug: string): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/portal-session", { tenantSlug });
  return res?.url ?? null;
}

/** One public plan as the control plane sells it. The product invents none of it. */
export type Offer = {
  id: string;
  name: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  includedSeats: number;
  currency: string;
  entitlements: Record<string, unknown>;
};

/** The public catalog. Empty without a control plane — ST-11 then shows no offers. */
export async function fetchOffers(): Promise<Offer[]> {
  const res = await call<{ offers: Offer[] }>("/api/gateway/offers", {});
  return res?.offers ?? [];
}

/** One invoice as the control plane mirrors it from the payment provider. */
export type Invoice = {
  number: string | null;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  pdfUrl: string | null;
};

/** Invoice history. Empty without a control plane — the table then says so. */
export async function fetchInvoices(tenantSlug: string): Promise<Invoice[]> {
  const res = await call<{ invoices: Invoice[] }>("/api/gateway/invoices", { tenantSlug });
  return res?.invoices ?? [];
}

export type RecheckResult =
  | {
      outcome: "reactivated" | "still_over";
      seats: number;
      mailboxes: number;
      maxSeats: number;
      maxMailboxes: number;
    }
  | { outcome: "not_suspended" | "unpaid" | "unknown" };

/**
 * A suspended workspace that reduced its usage asks to be re-checked right
 * away instead of waiting for the control plane's next sweep.
 */
export async function recheckSuspension(tenantSlug: string): Promise<RecheckResult | null> {
  return call<RecheckResult>("/api/gateway/recheck", { tenantSlug });
}
