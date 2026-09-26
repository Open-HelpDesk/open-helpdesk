/**
 * /api/scim/v2/* — inbound SCIM 2.0 for the service desk directory (spec 19 §5.2).
 *
 * An adapter and nothing more: the protocol lives in ee/desk (`handleScim`).
 * The tenant comes from the bearer token, never from a cookie; the identity
 * provider is a machine with no session. When the request also carries a
 * workspace subdomain, it must name the same workspace as the token — a token
 * sent to the wrong address is refused rather than silently served.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, tenants } from "@openhelpdesk/db";
import { handleScim, tenantForScimToken } from "@openhelpdesk/ee-desk";
import { requestOrigin } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const SCIM_JSON = "application/scim+json";
const BASE = "/api/scim/v2";

function scimError(status: number, detail: string, scimType?: string): Response {
  return new Response(
    JSON.stringify({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      ...(scimType ? { scimType } : {}),
      detail,
    }),
    { status, headers: { "content-type": SCIM_JSON, ...(status === 401 ? { "www-authenticate": 'Bearer realm="scim"' } : {}) } },
  );
}

/** meta.location and $ref are emitted relative to the SCIM base; clients expect absolute URIs. */
function absolutize(value: unknown, origin: string): unknown {
  if (Array.isArray(value)) return value.map((v) => absolutize(v, origin));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = (k === "location" || k === "$ref") && typeof v === "string" && v.startsWith(BASE) ? origin + v : absolutize(v, origin);
    }
    return out;
  }
  return value;
}

async function handle(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const tenantId = token ? await tenantForScimToken(token) : null;
  if (!tenantId) return scimError(401, "Provide the workspace SCIM token as a Bearer token.");

  const [tenant] = await db.select({ slug: tenants.slug, status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return scimError(401, "Provide the workspace SCIM token as a Bearer token.");
  const hostSlug = request.headers.get("x-tenant-slug");
  if (hostSlug && hostSlug !== tenant.slug) return scimError(401, "This token belongs to another workspace.");
  if (tenant.status === "suspended" || tenant.status === "deleting") return scimError(403, "This workspace is suspended.");

  let body: unknown = null;
  if (request.method !== "GET" && request.method !== "DELETE") {
    const text = await request.text();
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return scimError(400, "The request body is not valid JSON.", "invalidSyntax");
      }
    }
  }

  const { path = [] } = await ctx.params;
  const result = await handleScim(tenantId, request.method, "/" + path.join("/"), request.nextUrl.searchParams, body);
  const origin = requestOrigin(request);
  const headers = new Headers(result.headers ?? {});
  const location = headers.get("location");
  if (location?.startsWith(BASE)) headers.set("location", origin + location);
  if (result.status === 204 || result.body === null || result.body === undefined) {
    return new Response(null, { status: result.status, headers });
  }
  if (!headers.has("content-type")) headers.set("content-type", SCIM_JSON);
  return new Response(JSON.stringify(absolutize(result.body, origin)), { status: result.status, headers });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
