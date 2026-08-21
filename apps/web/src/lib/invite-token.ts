/**
 * Invitation d'agent (ST-02, onboarding AG-02) — jeton signé HMAC, même
 * famille que les liens magiques du portail (lib/portal-auth.ts) : rien n'est
 * stocké, le jeton porte l'utilisateur invité et son échéance. Cliquer le lien
 * vaut preuve de contrôle de l'adresse email.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000; // 7 jours

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Jeton `userId.expiry.sig` — userId = ligne app.users (status invited). */
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
