/**
 * /api/v1/portal/auth/handoff — the magic link's last step, into the app (MC-00).
 *
 * The customer tapped the link in their mail app; /help/auth verified the token
 * and set the portal cookie; the browser arrives here. A native app cannot read
 * that cookie, so this route mints a one-time code and redirects to the app's
 * own URL scheme, which the app trades for a session (../exchange).
 *
 * Whoever opens the link in a desktop browser instead lands on a scheme nothing
 * handles, which is why /help/auth only sends people here when the app asked
 * for it: the web portal's own links keep going to the requests page.
 *
 * Same two safeguards as the agents' SSO handover: the destination scheme is
 * configured on the instance rather than taken from the query string, and the
 * code is bound to the PKCE challenge the app generated before sending the
 * customer to their mailbox.
 */
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createAuthCode, isValidChallenge } from "@/lib/device-auth";
import { getPortalContact } from "@/lib/portal-auth";
import { getPortalSettings } from "@/lib/portal-config";

const SCHEME = (process.env.MOBILE_APP_SCHEME ?? "openhelpdesk").toLowerCase();

export async function GET(request: NextRequest) {
  if (!/^[a-z][a-z0-9+.-]{1,31}$/.test(SCHEME)) {
    return apiError(500, "internal_error", "MOBILE_APP_SCHEME is not a usable URL scheme.");
  }
  if (!(await getPortalSettings()).portalEnabled) {
    return apiError(404, "portal_disabled", "This workspace does not serve a customer portal.");
  }

  const challenge = request.nextUrl.searchParams.get("code_challenge") ?? "";
  if (!isValidChallenge(challenge)) {
    return apiError(400, "invalid_challenge", "Pass the code_challenge the link was built with.");
  }
  const state = (request.nextUrl.searchParams.get("state") ?? "").slice(0, 128);

  const session = await getPortalContact();
  if (!session) {
    /*
     * No cookie: the link expired, was already used from another browser, or
     * this is a bare visit to the URL. There is nothing to hand over and no
     * page to send them to that would help — the app is where they started.
     */
    return apiError(401, "unauthorized", "This link is no longer valid. Ask for a new one.");
  }

  const code = await createAuthCode(
    session.tenant.id,
    { kind: "contact", contactId: session.contact.id },
    challenge,
  );
  const target = `${SCHEME}://portal-auth?code=${encodeURIComponent(code)}${
    state ? `&state=${encodeURIComponent(state)}` : ""
  }`;
  return new NextResponse(null, { status: 303, headers: { location: target } });
}
