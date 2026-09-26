/**
 * SD-A9 → Compliance — the signature of the events sent to a SIEM.
 *
 * The configuration holds only the webhook URL (DeskConfig.compliance), no
 * secret. Rather than send unsigned events, the signing key is derived per
 * workspace from the instance key material — the same material
 * @openhelpdesk/crypto uses — so it is stable, never stored, and shown to an
 * administrator on demand so the receiver can verify `x-ohd-signature`.
 *
 * Signature scheme: the one of the outbound webhooks (packages/webhooks) —
 * HMAC-SHA256 of the exact body bytes, sent as `x-ohd-signature: sha256=<hex>`.
 */
import { createHmac } from "node:crypto";

function keyMaterial(): string {
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit && explicit.length >= 16) return explicit;
  const fallback = process.env.BETTER_AUTH_SECRET;
  if (fallback && fallback.length >= 8) return fallback;
  return "openhelpdesk-dev-encryption-key";
}

export function siemSigningSecret(tenantId: string): string {
  return createHmac("sha256", keyMaterial()).update(`desk-siem:${tenantId}`).digest("hex");
}

export function signSiemBody(tenantId: string, body: string): string {
  return `sha256=${createHmac("sha256", siemSigningSecret(tenantId)).update(body).digest("hex")}`;
}

/** https everywhere; plain http only outside production, for a local receiver. */
export function validSiemUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "https:") return url;
    if (url.protocol === "http:" && process.env.NODE_ENV !== "production") return url;
    return null;
  } catch {
    return null;
  }
}

/**
 * In production the receiver must resolve to public addresses only: the test
 * is sent from inside the instance, so an internal address (metadata service,
 * database, private network) would turn the button into a probe.
 */
export async function isPublicSiemTarget(url: URL): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  const { lookup } = await import("node:dns/promises");
  const { BlockList, isIP } = await import("node:net");
  const blocked = new BlockList();
  for (const [net, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
    ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ] as const) blocked.addSubnet(net, prefix, "ipv4");
  for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const)
    blocked.addSubnet(net, prefix, "ipv6");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every((a) => !blocked.check(a.address, a.family === 6 ? "ipv6" : "ipv4"))
    );
  } catch {
    return false;
  }
}
