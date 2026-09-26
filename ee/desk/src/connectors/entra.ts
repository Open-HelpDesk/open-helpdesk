/**
 * Microsoft Entra ID — access is membership of the security group a licence
 * tier maps to (`desk_app_tiers.external_group`, e.g. `app-figma-editor`);
 * the application's own Entra enterprise app assignment follows the group.
 *
 * Client credentials (application permissions `GroupMember.ReadWrite.All`,
 * `User.Read.All`, and `AuditLog.Read.All` for last sign-ins). Disable and
 * delete both remove the membership: switching the Entra account off is the
 * identity provider's decision, not one application's.
 *
 * Base URLs are settings so a sovereign cloud (graph.microsoft.us,
 * microsoftgraph.chinacloudapi.cn) or a test mock can stand in.
 */
import type { ProvisionInput } from "@openhelpdesk/desk";
import { ConnectorError, failure, http, trimSlash } from "./http";
import type { LoadedConnector } from "./store";

export type EntraConfig = {
  directoryId: string;
  clientId: string;
  clientSecret: string;
  graph: string;
  login: string;
};

function pick(c: LoadedConnector, key: string): string | null {
  const v = c.secrets[key] ?? c.settings[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function entraConfig(c: LoadedConnector): EntraConfig {
  const directoryId = pick(c, "tenantId") ?? pick(c, "directoryId");
  const clientId = pick(c, "clientId");
  const clientSecret = pick(c, "clientSecret");
  if (!directoryId || !clientId || !clientSecret) {
    throw new ConnectorError("Entra ID: tenant id, client id and client secret are required", "connector");
  }
  return {
    directoryId,
    clientId,
    clientSecret,
    graph: trimSlash(pick(c, "graphBaseUrl") ?? "https://graph.microsoft.com"),
    login: trimSlash(pick(c, "loginBaseUrl") ?? "https://login.microsoftonline.com"),
  };
}

const tokens = new Map<string, { token: string; expiresAt: number }>();

export async function entraToken(cfg: EntraConfig): Promise<string> {
  const key = `${cfg.login}|${cfg.directoryId}|${cfg.clientId}|${cfg.clientSecret.slice(-6)}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await http(`${cfg.login}/${encodeURIComponent(cfg.directoryId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: `${cfg.graph}/.default`,
    }).toString(),
  });
  const json = res.json as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !json?.access_token) {
    // Any token failure is the connection's: wrong secret, expired secret, wrong tenant.
    throw new ConnectorError(failure(res, "Entra ID: token").message, "connector", res.status);
  }
  tokens.set(key, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function graph(cfg: EntraConfig, method: string, path: string, body?: unknown) {
  const token = await entraToken(cfg);
  return http(`${cfg.graph}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ConsistencyLevel: "eventual",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const odataQuote = (s: string) => s.replace(/'/g, "''");

/** The Entra object id of a person: by UPN first, then by mail. */
export async function entraUserId(cfg: EntraConfig, email: string, known: string | null): Promise<string> {
  if (known && GUID.test(known)) return known;
  const direct = await graph(cfg, "GET", `/v1.0/users/${encodeURIComponent(email)}?$select=id`);
  if (direct.ok && typeof (direct.json as { id?: unknown })?.id === "string") return (direct.json as { id: string }).id;
  if (direct.status !== 404) {
    if (!direct.ok) throw failure(direct, `Entra ID: user ${email}`);
  }
  const q = encodeURIComponent(`mail eq '${odataQuote(email)}' or userPrincipalName eq '${odataQuote(email)}'`);
  const res = await graph(cfg, "GET", `/v1.0/users?$filter=${q}&$select=id`);
  if (!res.ok) throw failure(res, `Entra ID: user ${email}`);
  const id = (res.json as { value?: Array<{ id: string }> })?.value?.[0]?.id;
  if (!id) throw new ConnectorError(`Entra ID: no user ${email} in the directory`, "item", 404);
  return id;
}

/** A tier's group: an object id, or a display name resolved once. */
export async function entraGroupId(cfg: EntraConfig, group: string): Promise<string> {
  if (GUID.test(group)) return group;
  const q = encodeURIComponent(`displayName eq '${odataQuote(group)}'`);
  const res = await graph(cfg, "GET", `/v1.0/groups?$filter=${q}&$select=id`);
  if (!res.ok) throw failure(res, `Entra ID: group ${group}`);
  const id = (res.json as { value?: Array<{ id: string }> })?.value?.[0]?.id;
  if (!id) throw new ConnectorError(`Entra ID: no group named ${group}`, "item", 404);
  return id;
}

function groupOf(input: ProvisionInput): string {
  const g = input.tier.externalGroup?.trim();
  if (!g) throw new ConnectorError(`${input.app.name} · ${input.tier.name}: no Entra group mapped to this tier`, "item");
  return g;
}

export async function entraAddMember(cfg: EntraConfig, input: ProvisionInput): Promise<string> {
  const userId = await entraUserId(cfg, input.person.email, input.externalAccountId);
  const groupId = await entraGroupId(cfg, groupOf(input));
  const res = await graph(cfg, "POST", `/v1.0/groups/${groupId}/members/$ref`, {
    "@odata.id": `${cfg.graph}/v1.0/directoryObjects/${userId}`,
  });
  // "One or more added object references already exist" — already a member: done.
  if (!res.ok && !(res.status === 400 && /already exist/i.test(res.text))) throw failure(res, `Entra ID: add to ${groupOf(input)}`);
  return userId;
}

export async function entraRemoveMember(cfg: EntraConfig, input: ProvisionInput): Promise<void> {
  let userId: string;
  try {
    userId = await entraUserId(cfg, input.person.email, input.externalAccountId);
  } catch (err) {
    if (err instanceof ConnectorError && err.status === 404) return; // gone from the directory: nothing to remove
    throw err;
  }
  const groupId = await entraGroupId(cfg, groupOf(input));
  const res = await graph(cfg, "DELETE", `/v1.0/groups/${groupId}/members/${userId}/$ref`);
  if (!res.ok && res.status !== 404) throw failure(res, `Entra ID: remove from ${groupOf(input)}`);
}

export async function entraCheck(cfg: EntraConfig): Promise<string> {
  const res = await graph(cfg, "GET", "/v1.0/organization?$select=id,displayName");
  if (!res.ok) throw new ConnectorError(failure(res, "Entra ID: check").message, "connector", res.status);
  const org = (res.json as { value?: Array<{ displayName?: string }> })?.value?.[0]?.displayName;
  return org ? `Connected to ${org}` : "Connected";
}

/**
 * Last sign-in per user for one application, from the sign-in logs (needs
 * Entra ID P1). Best effort: an empty map when the logs are not available.
 */
export async function entraLastSignIns(cfg: EntraConfig, appName: string, since: Date): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const filter = encodeURIComponent(`appDisplayName eq '${odataQuote(appName)}' and createdDateTime ge ${since.toISOString()}`);
  let next: string | null = `/v1.0/auditLogs/signIns?$filter=${filter}&$select=userPrincipalName,createdDateTime&$top=500`;
  for (let page = 0; next && page < 20; page++) {
    const res = await graph(cfg, "GET", next);
    if (!res.ok) break;
    const json = res.json as { value?: Array<{ userPrincipalName?: string; createdDateTime?: string }>; "@odata.nextLink"?: string };
    for (const s of json.value ?? []) {
      if (!s.userPrincipalName || !s.createdDateTime) continue;
      const k = s.userPrincipalName.toLowerCase();
      const d = new Date(s.createdDateTime);
      if (!out.has(k) || out.get(k)! < d) out.set(k, d);
    }
    const link = json["@odata.nextLink"];
    next = link ? link.replace(cfg.graph, "") : null;
  }
  return out;
}
