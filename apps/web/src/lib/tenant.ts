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
