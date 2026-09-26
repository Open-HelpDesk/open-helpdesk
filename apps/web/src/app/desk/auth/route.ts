/**
 * Employee portal — magic-link landing (spec 19 §5.3).
 *
 * Same token and same session cookie as the customer portal (lib/portal-auth):
 * one contact, one session on the tenant's subdomain. It lives here rather
 * than reusing /help/auth for two reasons: that route only forwards to /help
 * pages (an open-redirect guard worth keeping), and it answers 404 when the
 * customer portal is switched off — which must not lock employees out.
 */
import { NextResponse, type NextRequest } from "next/server";
import { contacts, db } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { PORTAL_COOKIE, getPortalTenant, sessionToken, verifyPortalToken } from "@/lib/portal-auth";
import { requestOrigin } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const base = requestOrigin(request);
  const tenant = await getPortalTenant();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!tenant) return NextResponse.redirect(new URL("/desk/login", base));
  const contactId = verifyPortalToken(tenant.id, token);
  if (!contactId) return NextResponse.redirect(new URL("/desk/login?error=expired", base));
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  if (!contact || contact.blocked) {
    return NextResponse.redirect(new URL("/desk/login?error=expired", base));
  }
  // Only ever the portal itself: a destination read from the query string
  // would turn a signed link into an open redirect.
  const response = NextResponse.redirect(new URL("/desk", base));
  response.cookies.set(PORTAL_COOKIE, sessionToken(tenant.id, contact.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return response;
}
