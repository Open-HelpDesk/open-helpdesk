/**
 * Multi-tenant resolution by subdomain.
 *
 * {slug}.$BASE_DOMAIN            → agent space + admin + portal of tenant "slug"
 * $BASE_DOMAIN (bare domain)     → DEFAULT_TENANT_SLUG (single-tenant self-hosted), otherwise 404
 * reserved subdomain             → 404 (www, console, api, status, docs)
 * custom domain (EE)             → resolution in the database, outside Lot 0
 *
 * In dev: acme.localhost:3000 works with no DNS configuration.
 */
import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_SUBDOMAINS } from "@openhelpdesk/config";
import { WORKSPACE_NOT_FOUND } from "@/lib/workspace-not-found";

const BASE_DOMAIN = (process.env.BASE_DOMAIN ?? "localhost:3000").toLowerCase();

/**
 * Shape only — never existence.
 *
 * There is no database on the edge, so a slug that merely *looks* right gets
 * through here; whether the workspace exists is settled downstream by
 * `requireTenant()` (see lib/tenant.ts). Both checks are needed: this one keeps
 * reserved subdomains out, that one keeps invented ones out.
 */
function resolveTenantSlug(host: string): string | null {
  const h = host.toLowerCase();
  if (h === BASE_DOMAIN) {
    return process.env.DEFAULT_TENANT_SLUG ?? null;
  }
  if (!h.endsWith(`.${BASE_DOMAIN}`)) {
    // Custom domain (EE feature): will require a resolution in the database.
    return null;
  }
  const slug = h.slice(0, -(BASE_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return null;
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(slug)) return null;
  return slug;
}

export function middleware(request: NextRequest) {
  // Ingestion webhooks carry no tenant in the host: the tenant is resolved from
  // the recipient address. Do not require a subdomain here.
  if (request.nextUrl.pathname.startsWith("/api/ingress/")) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") ?? "";
  const slug = resolveTenantSlug(host);

  if (!slug) {
    // The only product message that CANNOT be translated, and it is not an
    // oversight: the language comes from the tenant, and the tenant is precisely
    // what could not be resolved. Besides, it addresses whoever hosts the
    // instance, not a user — hence the mention of the environment variable.
    // In cloud (SIGNUP_URL defined), the page invites creating a workspace.
    // Same words as app/not-found.tsx, from lib/workspace-not-found.ts: same
    // situation for the visitor, and React is not available in this runtime.
    const signupUrl = process.env.SIGNUP_URL;
    if (signupUrl) {
      return new NextResponse(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workspace not found</title></head>` +
          `<body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#F4F6F5;color:#11211C">` +
          `<div style="text-align:center;padding:24px;max-width:420px"><h1 style="font-size:22px;margin:0 0 10px">${WORKSPACE_NOT_FOUND.title}</h1>` +
          `<p style="font-size:14px;color:#51615B;margin:0 0 18px">${WORKSPACE_NOT_FOUND.body}</p>` +
          `<a href="${signupUrl}" style="display:inline-block;background:#0B5F46;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${WORKSPACE_NOT_FOUND.cta}</a></div></body></html>`,
        { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new NextResponse(
      "Workspace not found. Check the address, or set DEFAULT_TENANT_SLUG when self-hosting.",
      { status: 404 },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-tenant-slug", slug);
  // Server layouts have no access to the path: suspension (ST-11) needs it.
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
