import { headers } from "next/headers";

/** Slug du tenant courant, posé par le middleware. */
export async function getTenantSlug(): Promise<string> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) {
    throw new Error("Tenant non résolu — la requête n'est pas passée par le middleware.");
  }
  return slug;
}

/** Tenant courant (résolu depuis le domaine) — pour les routes publiques. */
export async function getTenantFromHeaders() {
  const { db, tenants } = await import("@openhelpdesk/db");
  const { eq } = await import("drizzle-orm");
  const slug = await getTenantSlug();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant ?? null;
}
