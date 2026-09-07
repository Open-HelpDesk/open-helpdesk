/**
 * /api/v1/portal/auth/exchange — the customer app's sign-in result (MC-00).
 *
 * Trades the handover code for a session bound to this phone. The verifier is
 * what proves the app that generated the challenge is the one collecting the
 * code: a custom URL scheme can be claimed by more than one installed app.
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
} from "@/lib/api";
import {
  consumeAuthCode,
  createDeviceSession,
  readDeviceInfo,
  sessionContact,
} from "@/lib/device-auth";
import { readPortalSettings } from "@/lib/portal-config";
import { serializePortalContact } from "@/lib/portal-api";
import { contactOrganization } from "@/lib/portal-data";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const retryAfter = rateLimit(`portal-exchange-ip:${ip}`, 40, 5 * 60_000);
  if (retryAfter !== null) return rateLimitedResponse(retryAfter);

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const code = String(body.code ?? "");
  const verifier = String(body.code_verifier ?? "");
  if (!code || !verifier) {
    return apiError(400, "invalid_body", "Provide the code and its code_verifier.");
  }

  const claim = await consumeAuthCode(code, verifier);
  // Expired, spent, wrong verifier, or an agent's SSO code offered here.
  if (!claim || claim.owner.kind !== "contact") {
    return apiError(401, "invalid_code", "This sign-in code is no longer valid.");
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, claim.tenantId));
  if (!tenant) {
    return apiError(404, "workspace_not_found", "This code's workspace no longer exists.");
  }
  if (!readPortalSettings(tenant.portalConfig).portalEnabled) {
    return apiError(404, "portal_disabled", "This workspace does not serve a customer portal.");
  }
  const contact = await sessionContact(claim.tenantId, claim.owner.contactId);
  if (!contact) {
    return apiError(403, "blocked", "This address cannot sign in to this workspace.");
  }

  const session = await createDeviceSession(
    tenant.id,
    { kind: "contact", contactId: contact.id },
    readDeviceInfo(body.device),
  );
  return apiJson(
    {
      token: session.token,
      session_id: session.id,
      expires_at: session.expiresAt.toISOString(),
      contact: serializePortalContact(contact, await contactOrganization(tenant.id, contact.id)),
      workspace: { slug: tenant.slug, name: tenant.name },
    },
    201,
  );
}
