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
  // Les webhooks d'ingestion ne portent pas de tenant dans l'hôte : le tenant
  // est résolu par l'adresse destinataire. Ne pas exiger un sous-domaine ici.
  if (request.nextUrl.pathname.startsWith("/api/ingress/")) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") ?? "";
  const slug = resolveTenantSlug(host);

  if (!slug) {
    // Le seul message du produit qui ne peut PAS être traduit, et ce n'est pas
    // un oubli : la langue vient du tenant, et c'est précisément le tenant qu'on
    // n'a pas su résoudre. Il s'adresse d'ailleurs à qui héberge l'instance, pas
    // à un utilisateur — d'où la mention de la variable d'environnement.
    // En cloud (SIGNUP_URL défini), la page invite à créer son workspace ;
    // le texte reste en anglais : la langue vient du tenant, non résolu ici.
    const signupUrl = process.env.SIGNUP_URL;
    if (signupUrl) {
      return new NextResponse(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workspace not found</title></head>` +
          `<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#F4F6F5;color:#11211C">` +
          `<div style="text-align:center;padding:24px;max-width:420px"><h1 style="font-size:22px;margin:0 0 10px">This workspace does not exist</h1>` +
          `<p style="font-size:14px;color:#51615B;margin:0 0 18px">Check the address — or create your own workspace in under a minute.</p>` +
          `<a href="${signupUrl}" style="display:inline-block;background:#0B5F46;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Create my workspace</a></div></body></html>`,
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new NextResponse(
      "Workspace introuvable. Vérifiez l'adresse, ou définissez DEFAULT_TENANT_SLUG en auto-hébergé.",
      { status: 404 },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant-slug", slug);
  // Les layouts serveur n'ont pas accès au chemin : la suspension (ST-11) en a besoin.
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
