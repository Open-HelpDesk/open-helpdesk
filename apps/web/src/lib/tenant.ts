import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

/** Slug of the current tenant, set by the middleware. */
export async function getTenantSlug(): Promise<string> {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) {
    throw new Error("Tenant not resolved — the request did not go through the middleware.");
  }
  return slug;
}

/**
 * Current tenant (resolved from the domain) — for the public routes.
 *
 * Memoized per request: the root layout needs it twice, for the language and
 * for the favicon, and the portal adds its accent color and its logo on top.
 * Without `cache`, a single portal page triggered the same SQL query four
 * times.
 */
export const getTenantFromHeaders = cache(async () => {
  const { db, tenants } = await import("@openhelpdesk/db");
  const { eq } = await import("drizzle-orm");
  const slug = await getTenantSlug();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return tenant ?? null;
});

/**
 * Current tenant, or a 404 — the guard every public entry point owes the domain.
 *
 * The middleware only validates the *shape* of the subdomain: it runs on the
 * edge, with no database, so it cannot tell `mesange` from `secure-paypal-login`.
 * Both used to come through, and the page behind them answered 200 all the same:
 * a real sign-in form, password field and third-party SSO buttons, under a
 * wildcard certificate that made the padlock look right. With a wildcard DNS
 * record, that turns the whole domain into a phishing kit anyone can address —
 * which is precisely what Google Safe Browsing flags as a "deceptive page", for
 * the domain as a whole rather than for one URL.
 *
 * So the existence check belongs at every entry point that renders something to
 * an anonymous visitor. It costs nothing: getTenantFromHeaders is memoised per
 * request, and the pages here already call it (or getLocale, which does).
 *
 * It has to be `notFound()` rather than a rendered message: only a real 404
 * keeps these hostnames out of the index instead of turning each one into a
 * crawlable page.
 */
export async function requireTenant() {
  const tenant = await getTenantFromHeaders().catch(() => null);
  if (!tenant) notFound();
  return tenant;
}

/**
 * Real origin of a request, rebuilt from the `Host` header.
 *
 * A route handler's `request.url` does not always carry the tenant's subdomain.
 * A redirect built on it loses the workspace and falls into a 404: that is what
 * broke the magic link landing and the widget confirmation. `Host` is the source
 * the middleware already uses to resolve the tenant — the redirects lean on it
 * too.
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
