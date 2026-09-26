/**
 * Inbound SCIM 2.0 (RFC 7643 / RFC 7644) — the identity provider pushes the
 * employee directory (spec 19 §5.2, source 1).
 *
 * Framework-free: `handleScim` takes a method, a path relative to
 * `/api/scim/v2`, the query and the parsed body, and returns status, body and
 * headers. The Next route (apps/web/src/app/api/scim/v2/[[...path]]) only
 * adapts Request ↔ this, and resolves the tenant from the bearer token.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, deskSettings, withTenant } from "@openhelpdesk/db";
import type { Actor } from "@openhelpdesk/desk";
import { audit, hasDeskConnectors } from "./connectors/shared";
import { resourceTypes, schemas, serviceProviderConfig } from "./scim/discovery";
import { createGroup, deleteGroup, getGroup, listGroups, patchGroup, replaceGroup } from "./scim/groups";
import { SCIM_CONTENT_TYPE, ScimError, errorBody, isObject } from "./scim/protocol";
import { createUser, deleteUser, getUser, listUsers, patchUser, replaceUser } from "./scim/users";

/** Recognisable prefix (secret scanners), then 160 bits of randomness. */
const TOKEN_PREFIX = "ohd_scim_";
const TOKEN_RE = /^ohd_scim_[a-f0-9]{40}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ---------------- Inbound SCIM 2.0 (deskConnectors) ---------------- */

/** Generates a new inbound SCIM bearer token; returns it ONCE in clear. */
export async function rotateScimToken(tenantId: string, actor: Actor): Promise<{ token: string; suffix: string }> {
  if (!(await hasDeskConnectors(tenantId))) throw new Error("deskConnectors entitlement required");
  const token = TOKEN_PREFIX + randomBytes(20).toString("hex");
  const suffix = token.slice(-4);
  const now = new Date();
  await withTenant(tenantId, async (tx) => {
    const [before] = await tx.select({ suffix: deskSettings.scimTokenSuffix }).from(deskSettings).where(eq(deskSettings.tenantId, tenantId));
    await tx
      .insert(deskSettings)
      .values({ tenantId, scimTokenHash: hashToken(token), scimTokenSuffix: suffix, scimTokenCreatedAt: now })
      .onConflictDoUpdate({
        target: deskSettings.tenantId,
        set: { scimTokenHash: hashToken(token), scimTokenSuffix: suffix, scimTokenCreatedAt: now, updatedAt: now },
      });
    // The suffix only — the audit log must never hold a usable credential.
    await audit(tx, tenantId, actor, "desk.scim_token.rotated", { type: "desk_settings", id: null }, before?.suffix ? { suffix: before.suffix } : null, { suffix });
  });
  return { token, suffix };
}

/** Resolves a bearer token to its tenant — null when unknown. Constant-time compare on the hash. */
export async function tenantForScimToken(token: string): Promise<string | null> {
  if (!TOKEN_RE.test(token)) return null;
  const hash = hashToken(token);
  // No tenant is known yet: this is the lookup that establishes it (same as the
  // API keys of lib/api.ts), by an indexed equality on a hash of 160 random bits.
  const [row] = await db
    .select({ tenantId: deskSettings.tenantId, hash: deskSettings.scimTokenHash })
    .from(deskSettings)
    .where(eq(deskSettings.scimTokenHash, hash))
    .limit(1);
  if (!row?.hash) return null;
  const a = Buffer.from(row.hash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return row.tenantId;
}

export type ScimResponse = { status: number; body: unknown; headers?: Record<string, string> };

function ok(status: number, body: unknown): ScimResponse {
  const headers: Record<string, string> = { "content-type": SCIM_CONTENT_TYPE };
  if (isObject(body) && isObject(body.meta)) {
    const meta = body.meta as Record<string, unknown>;
    if (typeof meta.version === "string") headers.etag = meta.version;
    if (status === 201 && typeof meta.location === "string") headers.location = meta.location;
  }
  return { status, body, headers };
}

function fail(status: number, detail: string, scimType?: Parameters<typeof errorBody>[2]): ScimResponse {
  return { status, body: errorBody(status, detail, scimType), headers: { "content-type": SCIM_CONTENT_TYPE } };
}

/**
 * One SCIM request, framework-free: the Next route only adapts Request ↔ this.
 * Covers /ServiceProviderConfig, /ResourceTypes, /Schemas, /Users, /Groups
 * (GET list with `filter=userName eq "…"`, startIndex/count; GET one; POST;
 * PUT; PATCH with Operations add/replace/remove incl. `active` and `members`;
 * DELETE), enterprise extension (department, manager.value, employeeNumber),
 * and the custom hire/leave dates attributes.
 */
export async function handleScim(tenantId: string, method: string, path: string, query: URLSearchParams, body: unknown): Promise<ScimResponse> {
  try {
    if (!(await hasDeskConnectors(tenantId))) {
      return fail(403, "SCIM provisioning is not included in this workspace's subscription.");
    }
    const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
    const [resource, id, extra] = segments;
    const m = method.toUpperCase();
    if (extra !== undefined) return fail(404, `Unknown endpoint ${path}`);
    const kind = (resource ?? "").toLowerCase();

    if (kind === "serviceproviderconfig") {
      if (m !== "GET") return fail(405, "Method not allowed");
      return ok(200, serviceProviderConfig());
    }
    if (kind === "resourcetypes" || kind === "schemas") {
      if (m !== "GET") return fail(405, "Method not allowed");
      const out = kind === "schemas" ? schemas(id) : resourceTypes(id);
      return out ? ok(200, out) : fail(404, `${id} not found`);
    }
    if (kind === "users") {
      if (!id) {
        if (m === "GET") return ok(200, await listUsers(tenantId, query));
        if (m === "POST") return ok(201, await createUser(tenantId, body));
        return fail(405, "Method not allowed");
      }
      if (m === "GET") return ok(200, await getUser(tenantId, id));
      if (m === "PUT") return ok(200, await replaceUser(tenantId, id, body));
      if (m === "PATCH") return ok(200, await patchUser(tenantId, id, body));
      if (m === "DELETE") {
        await deleteUser(tenantId, id);
        return { status: 204, body: null };
      }
      return fail(405, "Method not allowed");
    }
    if (kind === "groups") {
      if (!id) {
        if (m === "GET") return ok(200, await listGroups(tenantId, query));
        if (m === "POST") return ok(201, await createGroup(tenantId, body));
        return fail(405, "Method not allowed");
      }
      if (m === "GET") return ok(200, await getGroup(tenantId, id, query));
      if (m === "PUT") return ok(200, await replaceGroup(tenantId, id, body));
      if (m === "PATCH") return ok(200, await patchGroup(tenantId, id, body));
      if (m === "DELETE") {
        await deleteGroup(tenantId, id);
        return { status: 204, body: null };
      }
      return fail(405, "Method not allowed");
    }
    if (kind === "bulk") return fail(501, "Bulk operations are not supported");
    if (kind === "me") return fail(501, "/Me is not supported: the SCIM client is an identity provider, not a user");
    return fail(404, `Unknown endpoint ${path}`);
  } catch (err) {
    if (err instanceof ScimError) return fail(err.status, err.message, err.scimType);
    // The core's typed errors (DeskError and subclasses, matched by shape so
    // this does not depend on how the core exports them).
    const rawCode = err instanceof Error ? (err as Error & { code?: unknown }).code : undefined;
    const code = typeof rawCode === "string" ? rawCode : null;
    if (code === "entitlement") return fail(403, "The service desk is not included in this workspace's subscription.");
    if (code === "people_limit") return fail(403, "The workspace's directory ceiling is reached: this person cannot be added.");
    if (code === "manager_cycle") return fail(400, "This manager would create a loop in the reporting line.", "invalidValue");
    if (code && /^invalid_/.test(code)) return fail(400, `Invalid value (${code}): ${(err as Error).message}`, "invalidValue");
    if (code === "not_found") return fail(404, (err as Error).message);
    console.error("[scim] unexpected error", err);
    return fail(500, "Internal error while processing the SCIM request");
  }
}
