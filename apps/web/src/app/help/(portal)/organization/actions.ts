"use server";

/**
 * PT-08 — core actions of organization administration (restricted to
 * contacts holding an orgAdminGrant): verified domains (DNS TXT) and
 * request sharing. The SSO actions live in ee/web (commercial
 * license): ee/web/src/portal/sso-actions.ts.
 */
import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, organizations, verifiedDomains } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { DOMAIN_VERIFICATION_TXT_PREFIX, PUBLIC_EMAIL_DOMAINS } from "@openhelpdesk/config";
import { requireOrgAdmin } from "@/lib/portal-auth";

/** Plausible domain name: alphanumeric labels + hyphens, at least one dot. */
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** "+ Add a domain": format + rejection of consumer domains + uniqueness per tenant. */
export async function addOrgDomain(formData: FormData) {
  const { session, org } = await requireOrgAdmin();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const fail = (error: string): never =>
    redirect(`/help/organization?tab=domains&error=${error}&domain=${encodeURIComponent(domain)}`);

  if (!DOMAIN_RE.test(domain)) fail("invalid");
  if ((PUBLIC_EMAIL_DOMAINS as readonly string[]).includes(domain)) fail("public");
  const [existing] = await db
    .select({ id: verifiedDomains.id })
    .from(verifiedDomains)
    .where(and(eq(verifiedDomains.tenantId, session.tenant.id), eq(verifiedDomains.domain, domain)));
  if (existing) fail("exists");

  await db.insert(verifiedDomains).values({
    tenantId: session.tenant.id,
    organizationId: org.id,
    domain,
    verificationToken: randomBytes(16).toString("hex"),
  });
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=domains");
}

/** "Verify now": looks for ohd-verify={token} in the domain's TXT records. */
export async function verifyOrgDomain(formData: FormData) {
  const { session, org } = await requireOrgAdmin();
  const id = String(formData.get("id") ?? "");
  const [row] = await db
    .select()
    .from(verifiedDomains)
    .where(
      and(
        eq(verifiedDomains.id, id),
        eq(verifiedDomains.tenantId, session.tenant.id),
        eq(verifiedDomains.organizationId, org.id),
      ),
    );
  if (!row) redirect("/help/organization?tab=domains");

  let found = false;
  try {
    const records = (await resolveTxt(row.domain)).map((chunks) => chunks.join(""));
    const expected = `${DOMAIN_VERIFICATION_TXT_PREFIX}${row.verificationToken}`;
    found = records.some((r) => r.trim() === expected || r.includes(expected));
  } catch {
    found = false; // NXDOMAIN, timeout…: treated as a verification failure
  }

  await db
    .update(verifiedDomains)
    .set(
      found
        ? { status: "verified", failCount: 0, lastCheckedAt: new Date() }
        : { status: "failed", failCount: row.failCount + 1, lastCheckedAt: new Date() },
    )
    .where(eq(verifiedDomains.id, row.id));
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=domains");
}

/** "Requests visible to the whole organization" toggle (organizations.sharedTickets). */
export async function toggleOrgSharing() {
  const { session, org } = await requireOrgAdmin();
  await db
    .update(organizations)
    .set({ sharedTickets: !org.sharedTickets })
    .where(and(eq(organizations.id, org.id), eq(organizations.tenantId, session.tenant.id)));
  revalidatePath("/help/organization");
  redirect("/help/organization?tab=members");
}
