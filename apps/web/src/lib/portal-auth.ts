/**
 * Portal auth (PT-07) — magic link by default, no password.
 * Contact sessions = HMAC-signed token in a host-only cookie (hence scoped to the
 * tenant's subdomain). Entirely separate from the agent auth (Better Auth).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { contacts, db, tenants } from "@openhelpdesk/db";
import { getOrgAdminOrg } from "@/lib/portal-data";
import { and, eq } from "drizzle-orm";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
export const PORTAL_COOKIE = "ohd_portal";
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 min
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** `contactId.expiry.sig` token — used for the magic link as well as for the session cookie. */
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

/** Contact logged in to the portal, or null. */
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

/**
 * PT-08 — portal session + organization the contact is an administrator of
 * (orgAdminGrant). Redirects otherwise. Shared between the core actions (domains,
 * sharing) and the SSO actions of ee/web.
 */
export async function requireOrgAdmin() {
  const session = await getPortalContact();
  if (!session) redirect("/help/login");
  const org = await getOrgAdminOrg(session.tenant.id, session.contact.id);
  if (!org) redirect("/help");
  return { session, org };
}
