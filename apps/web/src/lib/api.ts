/**
 * Public REST API (v1) — authentication, scopes, and the shared response shape.
 *
 * This is the surface behind the API keys minted in Settings → API. Until now
 * those keys were issued but no endpoint validated them; this file closes that
 * gap. Auth is by key, not by subdomain: the key resolves its own tenant, so a
 * call works regardless of the host it lands on — but it only ever sees that
 * one workspace.
 */
import { createHash } from "node:crypto";
import { apiKeys, db, tenants } from "@openhelpdesk/db";
import { and, eq, isNull } from "drizzle-orm";

export type ApiAuth = {
  tenant: typeof tenants.$inferSelect;
  scopes: string[];
  keyId: string;
};

/** JSON error, one consistent shape for every failure. */
export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function apiJson(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Resolve the caller from `Authorization: Bearer ohd_live_…`.
 *
 * The key is hashed and matched against a non-revoked row; the tenant comes
 * from the key. `lastUsedAt` is bumped fire-and-forget — a key's activity is
 * worth recording, but not worth blocking the request on.
 */
async function authenticate(request: Request): Promise<ApiAuth | Response> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(ohd_live_[a-f0-9]{32})$/);
  if (!match) {
    return apiError(401, "unauthorized", "Provide a valid API key as a Bearer token.");
  }
  const hashed = createHash("sha256").update(match[1]!).digest("hex");
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, hashed), isNull(apiKeys.revokedAt)));
  if (!key) {
    return apiError(401, "unauthorized", "This API key is unknown or has been revoked.");
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, key.tenantId));
  if (!tenant) {
    return apiError(401, "unauthorized", "This API key is not attached to a workspace.");
  }
  // A suspended or deleting workspace serves nothing over the API — same rule
  // the product applies to its own screens.
  if (tenant.status === "suspended" || tenant.status === "deleting") {
    return apiError(403, "workspace_suspended", "This workspace is suspended.");
  }
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { tenant, scopes: key.scopes, keyId: key.id };
}

/**
 * Wraps a handler with auth + scope check, so each route stays about its own
 * resource. `scope` is the permission the route needs: "read" for GETs,
 * "write" for mutations, "ticket:create" for the create-only key. A key that
 * lacks it gets a 403, not a 401 — it is known, just not allowed here.
 */
export async function withApi(
  request: Request,
  scope: string,
  handler: (auth: ApiAuth) => Promise<Response>,
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (!auth.scopes.includes(scope)) {
    return apiError(403, "forbidden", `This API key is missing the "${scope}" scope.`);
  }
  try {
    return await handler(auth);
  } catch (err) {
    console.error("[api] handler error:", err);
    return apiError(500, "internal_error", "Something went wrong handling the request.");
  }
}

/* ---------- Public serialization ---------- */

type TicketRow = typeof import("@openhelpdesk/db").tickets.$inferSelect;
type ContactRow = typeof import("@openhelpdesk/db").contacts.$inferSelect;

/** The public shape of a ticket — deliberately not the raw row: tenant_id and
 * internal ids stay out, timestamps go out as ISO strings. */
export function serializeTicket(
  t: TicketRow,
  requester?: { id: string; email: string; name: string | null } | null,
): Record<string, unknown> {
  return {
    number: t.number,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    channel: t.channel,
    type: t.type,
    requester: requester ? { id: requester.id, email: requester.email, name: requester.name } : null,
    assignee_id: t.assigneeId,
    organization_id: t.organizationId,
    created_at: t.createdAt?.toISOString() ?? null,
    updated_at: t.updatedAt?.toISOString() ?? null,
  };
}

export function serializeContact(c: ContactRow): Record<string, unknown> {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    blocked: c.blocked,
    created_at: c.createdAt?.toISOString() ?? null,
  };
}

/** Parse a JSON body, or return a 400 the caller can pass straight back. */
export async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return apiError(400, "invalid_body", "The request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid_body", "The request body is not valid JSON.");
  }
}
