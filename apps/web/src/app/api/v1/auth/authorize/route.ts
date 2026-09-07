/**
 * /api/v1/auth/authorize — the browser leg of an SSO sign-in on mobile (MO-00).
 *
 * A native app cannot read the cookie that Entra ID's redirect lands on, so the
 * handover needs a step in the middle. The app opens the workspace's normal
 * login page in a system browser with `?next=` pointing here; whatever the agent
 * used to sign in — Microsoft, Google, or the password form — the browser
 * arrives here with a session, and this route hands back a one-time code on the
 * app's own URL scheme. The app then exchanges it (POST /api/v1/auth/exchange).
 *
 * Two things make that handover safe:
 *
 * - The destination is the scheme configured on the instance, never a
 *   `redirect_uri` from the query string. An endpoint that mints a credential
 *   and sends it wherever it is told is an account takeover waiting for a
 *   phishing link.
 * - The code is bound to a PKCE challenge the app generated and kept. A custom
 *   URL scheme is not exclusive to one installed app, so a code intercepted on
 *   the way back is useless without the verifier behind it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createAuthCode, isValidChallenge } from "@/lib/device-auth";
import { apiAgent } from "@/lib/session";
import { requestOrigin } from "@/lib/tenant";

/** `openhelpdesk://auth?code=…`, unless the instance ships under another name. */
const SCHEME = (process.env.MOBILE_APP_SCHEME ?? "openhelpdesk").toLowerCase();

export async function GET(request: NextRequest) {
  if (!/^[a-z][a-z0-9+.-]{1,31}$/.test(SCHEME)) {
    return apiError(500, "internal_error", "MOBILE_APP_SCHEME is not a usable URL scheme.");
  }

  const challenge = request.nextUrl.searchParams.get("code_challenge") ?? "";
  if (!isValidChallenge(challenge)) {
    return apiError(
      400,
      "invalid_challenge",
      "Pass code_challenge as base64url(SHA-256(verifier)) — PKCE S256.",
    );
  }
  // Opaque to us, echoed back untouched: it is how the app recognises the
  // answer to its own request rather than one it never made.
  const state = (request.nextUrl.searchParams.get("state") ?? "").slice(0, 128);

  const current = await apiAgent();
  if (!current) {
    /*
     * Not signed in yet — send the browser through the workspace's own login
     * page and come back here. `next` carries this URL's path and query, so the
     * challenge survives the round trip without being stored anywhere.
     */
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const login = new URL("/login", requestOrigin(request));
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  const code = await createAuthCode(
    current.tenant.id,
    { kind: "agent", userId: current.agent.id },
    challenge,
  );
  const target = `${SCHEME}://auth?code=${encodeURIComponent(code)}${
    state ? `&state=${encodeURIComponent(state)}` : ""
  }`;
  /*
   * 303, not 307: the app's scheme is a different thing to fetch, and the
   * browser must not try to replay this GET against it.
   */
  return new NextResponse(null, { status: 303, headers: { location: target } });
}
