/**
 * /api/v1/auth/exchange — turn the browser leg's one-time code into a device
 * session (MO-00, SSO).
 *
 * The app arrives with the code it received on its URL scheme and the verifier
 * it never sent anywhere. Both are needed: the code alone proves only that
 * something on the phone caught a redirect, which another installed app could
 * have done too.
 *
 * The answer is the same shape as POST /api/v1/auth/login, so the app has one
 * sign-in result to handle whichever way the agent signed in.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, tenants } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  rateLimit,
  rateLimitedResponse,
  readJson,
  serializeAgent,
} from "@/lib/api";
import {
  consumeAuthCode,
  createDeviceSession,
  readDeviceInfo,
  sessionAgent,
} from "@/lib/device-auth";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const retryAfter = rateLimit(`exchange-ip:${ip}`, 40, 5 * 60_000);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const code = String(body.code ?? "");
  const verifier = String(body.code_verifier ?? "");
  if (!code || !verifier) {
    return apiError(400, "invalid_body", "Provide the code and its code_verifier.");
  }

  const claim = await consumeAuthCode(code, verifier);
  // Expired, already spent, the wrong verifier, or a customer's magic-link code
  // presented to the agent endpoint — one answer for all of them: whichever it
  // is, the app's move is to start its browser leg again.
  if (!claim || claim.owner.kind !== "agent") {
    return apiError(401, "invalid_code", "This sign-in code is no longer valid.");
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, claim.tenantId));
  if (!tenant) {
    return apiError(404, "workspace_not_found", "This code's workspace no longer exists.");
  }
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is suspended.");
  }
  const agent = await sessionAgent(claim.tenantId, claim.owner.userId);
  if (!agent) {
    return apiError(403, "not_a_member", "This account is not an agent of this workspace.");
  }

  const session = await createDeviceSession(
    tenant.id,
    { kind: "agent", userId: agent.id },
    readDeviceInfo(body.device),
  );
  return apiJson(
    {
      token: session.token,
      session_id: session.id,
      expires_at: session.expiresAt.toISOString(),
      agent: serializeAgent(agent),
      workspace: { slug: tenant.slug, name: tenant.name },
    },
    201,
  );
}
