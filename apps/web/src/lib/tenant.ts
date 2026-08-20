import { cache } from "react";
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

/**
 * Tenant courant (résolu depuis le domaine) — pour les routes publiques.
 *
 * Mémoïsé par requête : la mise en page racine en a besoin deux fois, pour la
 * langue et pour le favicon, et le portail y ajoute son accent et son logo.
 * Sans `cache`, une seule page du portail déclenchait quatre fois la même
 * requête SQL.
 */
export const getTenantFromHeaders = cache(async () => {
  const { db, tenants } = await import("@openhelpdesk/db");
  const { eq } = await import("drizzle-orm");
  const slug = await getTenantSlug();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant ?? null;
});

/**
 * Origine réelle d'une requête, reconstruite depuis l'en-tête `Host`.
 *
 * `request.url` d'un route handler ne porte pas toujours le sous-domaine du
 * tenant. Une redirection construite dessus perd le workspace et tombe en 404 :
 * c'est ce qui faisait échouer l'atterrissage du lien magique et la confirmation
 * du widget. `Host` est la source que le middleware emploie déjà pour résoudre
 * le tenant — les redirections s'y adossent aussi.
 */
export function requestOrigin(request: {
  headers: { get: (name: string) => string | null };
  nextUrl: { host: string; protocol: string };
}): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
