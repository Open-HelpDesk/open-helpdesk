/**
 * Auth portail (PT-07) — lien magique par défaut, sans mot de passe (specs/12).
 * Sessions contact = jeton signé HMAC en cookie host-only (donc scopé au sous-domaine
 * du tenant). Totalement distinct de l'auth agents (Better Auth).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { contacts, db, tenants } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
export const PORTAL_COOKIE = "ohd_portal";
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 min
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 jours

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Jeton `contactId.expiry.sig` — sert au lien magique comme au cookie de session. */
export function portalToken(tenantId: string, contactId: string, ttlMs: number): string {
  const expiry = Date.now() + ttlMs;
  return `${contactId}.${expiry}.${sign(`portal:${tenantId}:${contactId}:${expiry}`)}`;
}

export function magicLinkToken(tenantId: string, contactId: string): string {
  return portalToken(tenantId, contactId, MAGIC_LINK_TTL_MS);
}

export function sessionToken(tenantId: string, contactId: string): string {
  return portalToken(tenantId, contactId, SESSION_TTL_MS);
}

export function verifyPortalToken(tenantId: string, token: string): string | null {
  const [contactId, expiryRaw, sig] = token.split(".");
  if (!contactId || !expiryRaw || !sig) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;
  if (!safeEqual(sig, sign(`portal:${tenantId}:${contactId}:${expiry}`))) return null;
  return contactId;
}

export async function getPortalTenant() {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) return null;
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant ?? null;
}

/** Contact connecté au portail, ou null. */
export async function getPortalContact() {
  const tenant = await getPortalTenant();
  if (!tenant) return null;
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const contactId = verifyPortalToken(tenant.id, token);
  if (!contactId) return null;
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  if (!contact || contact.blocked) return null;
  return { tenant, contact };
}
