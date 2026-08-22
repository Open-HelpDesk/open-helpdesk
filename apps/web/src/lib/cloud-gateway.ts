/**
 * Client de la gateway billing PRIVÉE (console cloud) — apps/web ne porte ni
 * SDK Stripe ni clé : il demande une URL de session et redirige. Inactif sans
 * CLOUD_GATEWAY_URL (auto-hébergé, dev sans control plane).
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

export async function checkoutUrl(input: {
  tenantSlug: string;
  planId: string;
  interval: "month" | "year";
  seats: number;
}): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/checkout-session", input);
  return res?.url ?? null;
}

export async function portalUrl(tenantSlug: string): Promise<string | null> {
  const res = await call<{ url: string }>("/api/gateway/portal-session", { tenantSlug });
  return res?.url ?? null;
}
