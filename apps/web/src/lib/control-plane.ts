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
 * Subscription session: the product passes the workspace and its occupied seat
 * count, nothing more — what is subscribed to, and at what price, belongs to
 * the control plane.
 */
export async function checkoutUrl(input: {
  tenantSlug: string;
  seats: number;
}): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/checkout-session", input);
  return res?.url ?? null;
}

export async function portalUrl(tenantSlug: string): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/portal-session", { tenantSlug });
  return res?.url ?? null;
}
