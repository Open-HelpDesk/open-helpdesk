/** PT-07 — atterrissage du lien magique : vérifie le jeton, pose la session, redirige. */
import { NextResponse, type NextRequest } from "next/server";
import { contacts, db } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import {
  PORTAL_COOKIE,
  getPortalTenant,
  sessionToken,
  verifyPortalToken,
} from "@/lib/portal-auth";

export async function GET(request: NextRequest) {
  const tenant = await getPortalTenant();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "/help/requests";
  const safeTo = to.startsWith("/help") ? to : "/help/requests";

  if (!tenant) return NextResponse.redirect(new URL("/help/login", request.url));
  const contactId = verifyPortalToken(tenant.id, token);
  if (!contactId) {
    return NextResponse.redirect(new URL("/help/login?error=expired", request.url));
  }
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  if (!contact || contact.blocked) {
    return NextResponse.redirect(new URL("/help/login?error=expired", request.url));
  }

  const response = NextResponse.redirect(new URL(safeTo, request.url));
  response.cookies.set(PORTAL_COOKIE, sessionToken(tenant.id, contact.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return response;
}
