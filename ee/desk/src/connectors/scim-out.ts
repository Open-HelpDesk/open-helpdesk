/**
 * Outbound SCIM 2.0 — the service desk provisions accounts directly in an
 * application that exposes SCIM (Figma, Slack, GitHub Enterprise, Notion…),
 * with that application's own base URL and token (spec 19 §9).
 *
 * Every call is idempotent, because a job may be retried after a timeout
 * whose request did land: create looks the user up by userName first and
 * adopts what it finds (and a 409 on POST means the same thing); disable and
 * delete treat 404 as "already done".
 */
import type { ProvisionInput, Provisioner } from "@openhelpdesk/desk";
import { ConnectorError, failure, http, trimSlash, type HttpResult } from "./http";
import { appScimToken } from "./store";

const SCHEMA_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCHEMA_PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

type Target = { base: string; token: string; label: string };

function target(input: ProvisionInput): Target {
  const base = input.app.scimBaseUrl ? trimSlash(input.app.scimBaseUrl) : null;
  const token = appScimToken(input.app.scimToken);
  if (!base || !token) {
    throw new ConnectorError(`${input.app.name}: no SCIM base URL or token configured`, "connector");
  }
  return { base, token, label: input.app.name };
}

async function call(t: Target, method: string, path: string, body?: unknown): Promise<HttpResult> {
  return http(t.base + path, {
    method,
    headers: {
      authorization: `Bearer ${t.token}`,
      accept: "application/scim+json, application/json",
      ...(body !== undefined ? { "content-type": "application/scim+json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function splitName(full: string): { givenName: string; familyName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { givenName: full.trim(), familyName: full.trim() };
  return { givenName: parts.slice(0, -1).join(" "), familyName: parts[parts.length - 1]! };
}

export function userPayload(input: ProvisionInput) {
  const { givenName, familyName } = splitName(input.person.name);
  return {
    schemas: [SCHEMA_USER],
    userName: input.person.email,
    externalId: input.person.id,
    displayName: input.person.name,
    name: { formatted: input.person.name, givenName, familyName },
    emails: [{ value: input.person.email, type: "work", primary: true }],
    active: true,
  };
}

async function findByUserName(t: Target, userName: string): Promise<{ id: string; active: boolean } | null> {
  const filter = encodeURIComponent(`userName eq "${userName.replace(/"/g, '\\"')}"`);
  const res = await call(t, "GET", `/Users?filter=${filter}`);
  if (!res.ok) throw failure(res, `${t.label}: user lookup`);
  const resources = (res.json as { Resources?: Array<{ id?: string; active?: boolean }> } | null)?.Resources ?? [];
  const hit = resources.find((r) => typeof r.id === "string");
  return hit ? { id: hit.id!, active: hit.active !== false } : null;
}

async function setActive(t: Target, id: string, active: boolean): Promise<"done" | "gone"> {
  const res = await call(t, "PATCH", `/Users/${encodeURIComponent(id)}`, {
    schemas: [SCHEMA_PATCH],
    Operations: [{ op: "replace", path: "active", value: active }],
  });
  if (res.status === 404) return "gone";
  if (!res.ok) throw failure(res, `${t.label}: ${active ? "reactivation" : "deactivation"}`);
  return "done";
}

export const scimProvisioner: Provisioner = {
  async create(input) {
    const t = target(input);
    const existing = await findByUserName(t, input.person.email);
    if (existing) {
      // Adopt: the account exists (earlier attempt, or created by hand). Make sure it is usable.
      if (!existing.active) await setActive(t, existing.id, true);
      return { externalAccountId: existing.id };
    }
    const res = await call(t, "POST", "/Users", userPayload(input));
    if (res.status === 409) {
      const again = await findByUserName(t, input.person.email);
      if (again) {
        if (!again.active) await setActive(t, again.id, true);
        return { externalAccountId: again.id };
      }
      throw failure(res, `${t.label}: account creation (conflict, and the user cannot be found)`);
    }
    if (!res.ok) throw failure(res, `${t.label}: account creation`);
    const id = (res.json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !id) throw new ConnectorError(`${t.label}: account created but no id returned`, "item");
    return { externalAccountId: id };
  },

  async update(input) {
    const t = target(input);
    const id = input.externalAccountId ?? (await findByUserName(t, input.person.email))?.id ?? null;
    if (!id) {
      await scimProvisioner.create(input);
      return;
    }
    const p = userPayload(input);
    const res = await call(t, "PATCH", `/Users/${encodeURIComponent(id)}`, {
      schemas: [SCHEMA_PATCH],
      Operations: [
        { op: "replace", path: "displayName", value: p.displayName },
        { op: "replace", path: "name", value: p.name },
        { op: "replace", path: "emails", value: p.emails },
        { op: "replace", path: "active", value: true },
      ],
    });
    if (!res.ok) throw failure(res, `${t.label}: account update`);
  },

  async disable(input) {
    const t = target(input);
    const id = input.externalAccountId ?? (await findByUserName(t, input.person.email))?.id ?? null;
    if (!id) return; // nothing to disable: never created, or already deleted
    await setActive(t, id, false);
  },

  async delete(input) {
    const t = target(input);
    const id = input.externalAccountId ?? (await findByUserName(t, input.person.email))?.id ?? null;
    if (!id) return;
    const res = await call(t, "DELETE", `/Users/${encodeURIComponent(id)}`);
    if (res.status === 404) return;
    if (!res.ok) throw failure(res, `${t.label}: account deletion`);
  },
};

/** Connection check for one application: can we list users with this token? */
export async function checkScimApp(base: string, token: string, label: string): Promise<void> {
  const t: Target = { base: trimSlash(base), token, label };
  const res = await call(t, "GET", "/Users?count=1&startIndex=1");
  if (!res.ok) throw failure(res, `${label}: SCIM check`);
}
