/**
 * /api/v1/auth/login — sign in one device (MO-00).
 *
 * The mobile app cannot carry a workspace API key: it would be one shared
 * credential for every agent, unable to say whose tickets these are, and
 * unrevocable without cutting off the integrations that use the same key. So
 * the app signs in like a person and gets a token bound to that phone.
 *
 * The workspace comes from the host the call landed on — `{slug}.$BASE_DOMAIN`,
 * the same address the agent types in the app's "workspace" field — and not
 * from the body: a credential valid on one workspace must not be spendable on
 * another by editing a JSON field.
 *
 * Passwords are checked by Better Auth, never here, so the rules the web login
 * enforces (hashing, email verification when the instance requires it) hold for
 * the app too without being restated.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { auth } from "@openhelpdesk/auth";
import { db, tenants, users } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  rateLimit,
  rateLimitedResponse,
  readJson,
  serializeAgent,
} from "@/lib/api";
import { createDeviceSession, readDeviceInfo } from "@/lib/device-auth";

/**
 * Guessing budget for an unauthenticated endpoint that checks passwords.
 *
 * Two buckets, because they stop different things: per address, so one account
 * cannot be worked through a dictionary; per source, so a list of addresses
 * cannot be tried one attempt each. The API-wide limit does not apply here —
 * there is no key yet to count against.
 */
const LOGIN_WINDOW_MS = 5 * 60_000;
const LOGIN_MAX_PER_EMAIL = 10;
const LOGIN_MAX_PER_IP = 40;

export async function POST(request: NextRequest) {
  const slug = request.headers.get("x-tenant-slug");
  if (!slug) {
    return apiError(404, "workspace_not_found", "Call this on your workspace's own address.");
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  if (!tenant) {
    return apiError(404, "workspace_not_found", "No workspace at this address.");
  }
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is suspended.");
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return apiError(400, "invalid_body", "Provide an email and a password.");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const retryAfter =
    rateLimit(`login:${tenant.id}:${email}`, LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS) ??
    rateLimit(`login-ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);

  /*
   * Better Auth also opens a web session here, which the app never uses and
   * which expires on its own: there is no "verify this password" call that
   * stops short of it. Harmless, and cheaper than reimplementing password
   * verification next to the one that already exists.
   */
  let signedInEmail: string;
  try {
    const result = await auth.api.signInEmail({ body: { email, password } });
    signedInEmail = result.user.email;
  } catch (err) {
    if (err instanceof APIError) {
      const code = (err.body as { code?: string } | undefined)?.code;
      if (code === "EMAIL_NOT_VERIFIED") {
        return apiError(
          403,
          "email_not_verified",
          "Confirm your email address, then sign in again.",
        );
      }
      // One answer for "no such account" and "wrong password": telling them
      // apart is how a stranger learns which addresses are worth attacking.
      return apiError(401, "invalid_credentials", "Wrong email or password.");
    }
    throw err;
  }

  const [agent] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, signedInEmail)));
  /*
   * Same rule as the web workspace (lib/session.ts): membership is checked per
   * request against app.users, and only "disabled" closes the door. An invited
   * agent who has set a password is a member; a former one is not.
   */
  if (!agent || agent.status === "disabled") {
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
