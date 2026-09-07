/**
 * /api/v1/portal/auth/request-link — start a customer sign-in (MC-00).
 *
 * The customer app has no password to offer: the portal signs people in by
 * emailed link, and asking customers to invent an account before they can
 * report a problem is a support queue with a form in front of it. So the app
 * asks for the link, the customer taps it on their phone, and the browser leg
 * hands the session back to the app (see ../handoff).
 *
 * The link is the same one the web portal sends — same token, same 15 minutes,
 * same landing route — pointed at the handover instead of the requests page.
 * One email to maintain, one expiry to reason about.
 *
 * The answer is always the same: an address that has no account, one that is
 * blocked, one that exists — all get 202. Telling them apart would turn this
 * endpoint into a directory of a workspace's customers.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, tenants } from "@openhelpdesk/db";
import { apiError, apiJson, rateLimit, rateLimitedResponse, readJson } from "@/lib/api";
import { isValidChallenge } from "@/lib/device-auth";
import { sendPortalMagicLink } from "@/lib/portal-auth";
import { readPortalSettings } from "@/lib/portal-config";
import { findOrCreateContact } from "@/lib/portal-write";
import { getT } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const slug = request.headers.get("x-tenant-slug");
  if (!slug) {
    return apiError(404, "workspace_not_found", "Call this on your workspace's own address.");
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) {
    return apiError(404, "workspace_not_found", "No workspace at this address.");
  }
  if (!readPortalSettings(tenant.portalConfig).portalEnabled) {
    return apiError(404, "portal_disabled", "This workspace does not serve a customer portal.");
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    return apiError(400, "invalid_body", "Provide the email address to send the link to.");
  }
  const challenge = String(body.code_challenge ?? "");
  if (!isValidChallenge(challenge)) {
    return apiError(
      400,
      "invalid_challenge",
      "Pass code_challenge as base64url(SHA-256(verifier)) — PKCE S256.",
    );
  }

  /*
   * Tighter than the API-wide limit, and counted two ways: per address so a
   * mailbox cannot be buried under links somebody else asked for, per source so
   * a list of addresses cannot be walked.
   */
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const retryAfter =
    rateLimit(`portal-link:${tenant.id}:${email}`, 5, 15 * 60_000) ??
    rateLimit(`portal-link-ip:${ip}`, 30, 15 * 60_000);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);

  const contact = await findOrCreateContact(tenant.id, email);
  if (!contact.blocked) {
    const t = await getT();
    await sendPortalMagicLink(
      t,
      tenant,
      contact,
      `/api/v1/portal/auth/handoff?code_challenge=${encodeURIComponent(challenge)}`,
    );
  }
  return apiJson({ sent: true, email }, 202);
}
