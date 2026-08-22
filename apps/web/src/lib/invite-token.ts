/**
 * Agent invitation (ST-02, AG-02 onboarding) — HMAC-signed token, same family
 * as the portal magic links (lib/portal-auth.ts): nothing is stored, the token
 * carries the invited user and its expiry. Clicking the link counts as proof of
 * control over the email address.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** `userId.expiry.sig` token — userId = app.users row (status invited). */
export function inviteToken(tenantId: string, userId: string): string {
  const expiry = Date.now() + INVITE_TTL_MS;
  return `${userId}.${expiry}.${sign(`invite:${tenantId}:${userId}:${expiry}`)}`;
}

export function verifyInviteToken(tenantId: string, token: string): string | null {
  const [userId, expiryRaw, sig] = token.split(".");
  if (!userId || !expiryRaw || !sig) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;
  return safeEqual(sig, sign(`invite:${tenantId}:${userId}:${expiry}`)) ? userId : null;
}
