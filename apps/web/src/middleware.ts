/**
 * Résolution multi-tenant par sous-domaine — specs/01 § 4.
 *
 * {slug}.$BASE_DOMAIN            → espace agent + admin + portail du tenant "slug"
 * $BASE_DOMAIN (domaine nu)      → DEFAULT_TENANT_SLUG (auto-hébergé mono-tenant), sinon 404
 * sous-domaine réservé           → 404 (www, console, api, status, docs)
 * domaine custom (EE)            → résolution en base, hors Lot 0
 *
 * En dev : acme.localhost:3000 fonctionne sans configuration DNS.
 */
import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_SUBDOMAINS } from "@openhelpdesk/config";

const BASE_DOMAIN = (process.env.BASE_DOMAIN ?? "localhost:3000").toLowerCase();

function resolveTenantSlug(host: string): string | null {
  const h = host.toLowerCase();
  if (h === BASE_DOMAIN) {
    return process.env.DEFAULT_TENANT_SLUG ?? null;
  }
  if (!h.endsWith(`.${BASE_DOMAIN}`)) {
    // Domaine custom (fonctionnalité EE) : nécessitera une résolution en base.
    return null;
  }
  const slug = h.slice(0, -(BASE_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return null;
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(slug)) return null;
  return slug;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = resolveTenantSlug(host);

  if (!slug) {
    // Le seul message du produit qui ne peut PAS être traduit, et ce n'est pas
    // un oubli : la langue vient du tenant, et c'est précisément le tenant qu'on
    // n'a pas su résoudre. Il s'adresse d'ailleurs à qui héberge l'instance, pas
    // à un utilisateur — d'où la mention de la variable d'environnement.
    return new NextResponse(
      "Workspace introuvable. Vérifiez l'adresse, ou définissez DEFAULT_TENANT_SLUG en auto-hébergé.",
      { status: 404 },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant-slug", slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
