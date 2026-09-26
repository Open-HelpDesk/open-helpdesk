/**
 * Google Workspace — access is membership of the Google group a licence tier
 * maps to (`desk_app_tiers.external_group`, an address or a local part
 * completed with the connector's domain).
 *
 * A service account with domain-wide delegation, impersonating an admin
 * (`adminEmail`): the JWT is signed here with node:crypto (RS256), no Google
 * SDK. Scopes: admin.directory.group.member, admin.reports.audit.readonly.
 */
import { createSign } from "node:crypto";
import type { ProvisionInput } from "@openhelpdesk/desk";
import { ConnectorError, failure, http, trimSlash } from "./http";
import type { LoadedConnector } from "./store";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
];

export type GoogleConfig = {
  clientEmail: string;
  privateKey: string;
  adminEmail: string;
  domain: string | null;
  tokenUrl: string;
  api: string;
};

function pick(c: LoadedConnector, key: string): string | null {
  const v = c.secrets[key] ?? c.settings[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function googleConfig(c: LoadedConnector): GoogleConfig {
  // The JSON key file as downloaded from Google Cloud, or its two fields.
  let key: { client_email?: string; private_key?: string; token_uri?: string } = {};
  const raw = pick(c, "serviceAccountKey");
  if (raw) {
    try {
      key = JSON.parse(raw);
    } catch {
      throw new ConnectorError("Google Workspace: the service account key is not valid JSON", "connector");
    }
  }
  const clientEmail = key.client_email ?? pick(c, "clientEmail");
  const privateKey = (key.private_key ?? pick(c, "privateKey"))?.replace(/\\n/g, "\n") ?? null;
  const adminEmail = pick(c, "adminEmail");
  if (!clientEmail || !privateKey || !adminEmail) {
    throw new ConnectorError("Google Workspace: service account key and admin email are required", "connector");
  }
  return {
    clientEmail,
    privateKey,
    adminEmail,
    domain: pick(c, "domain"),
    tokenUrl: pick(c, "tokenUrl") ?? key.token_uri ?? "https://oauth2.googleapis.com/token",
    api: trimSlash(pick(c, "apiBaseUrl") ?? "https://admin.googleapis.com"),
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** RFC 7523 assertion for the service account, impersonating the admin (domain-wide delegation). */
export function signAssertion(cfg: GoogleConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      sub: cfg.adminEmail,
      scope: GOOGLE_SCOPES.join(" "),
      aud: cfg.tokenUrl,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  let signature: string;
  try {
    signature = signer.sign(cfg.privateKey).toString("base64url");
  } catch {
    throw new ConnectorError("Google Workspace: the private key cannot sign (malformed PEM)", "connector");
  }
  return `${header}.${claims}.${signature}`;
}

const tokens = new Map<string, { token: string; expiresAt: number }>();

export async function googleToken(cfg: GoogleConfig): Promise<string> {
  const key = `${cfg.tokenUrl}|${cfg.clientEmail}|${cfg.adminEmail}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await http(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signAssertion(cfg) }).toString(),
  });
  const json = res.json as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !json?.access_token) throw new ConnectorError(failure(res, "Google Workspace: token").message, "connector", res.status);
  tokens.set(key, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

async function api(cfg: GoogleConfig, method: string, path: string, body?: unknown) {
  const token = await googleToken(cfg);
  return http(`${cfg.api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function groupKey(cfg: GoogleConfig, input: ProvisionInput): string {
  const g = input.tier.externalGroup?.trim();
  if (!g) throw new ConnectorError(`${input.app.name} · ${input.tier.name}: no Google group mapped to this tier`, "item");
  if (g.includes("@")) return g;
  if (!cfg.domain) throw new ConnectorError(`Google Workspace: group ${g} needs a domain`, "connector");
  return `${g}@${cfg.domain}`;
}

export async function googleAddMember(cfg: GoogleConfig, input: ProvisionInput): Promise<string> {
  const group = groupKey(cfg, input);
  const res = await api(cfg, "POST", `/admin/directory/v1/groups/${encodeURIComponent(group)}/members`, {
    email: input.person.email,
    role: "MEMBER",
  });
  if (res.status === 409) return input.person.email; // "Member already exists"
  if (!res.ok) throw failure(res, `Google Workspace: add to ${group}`);
  const id = (res.json as { id?: string } | null)?.id;
  return id ?? input.person.email;
}

export async function googleRemoveMember(cfg: GoogleConfig, input: ProvisionInput): Promise<void> {
  const group = groupKey(cfg, input);
  const res = await api(cfg, "DELETE", `/admin/directory/v1/groups/${encodeURIComponent(group)}/members/${encodeURIComponent(input.person.email)}`);
  if (!res.ok && res.status !== 404) throw failure(res, `Google Workspace: remove from ${group}`);
}

export async function googleCheck(cfg: GoogleConfig): Promise<string> {
  const q = cfg.domain ? `domain=${encodeURIComponent(cfg.domain)}` : "customer=my_customer";
  const res = await api(cfg, "GET", `/admin/directory/v1/groups?${q}&maxResults=1`);
  if (!res.ok) throw new ConnectorError(failure(res, "Google Workspace: check").message, "connector", res.status);
  return cfg.domain ? `Connected to ${cfg.domain}` : "Connected";
}

/**
 * Last OAuth authorisation per user for one application (Reports API,
 * `token` activities). Best effort: matches the application by name.
 */
export async function googleLastLogins(cfg: GoogleConfig, appName: string, since: Date): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const wanted = appName.toLowerCase();
  let pageToken: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ startTime: since.toISOString(), maxResults: "1000" });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await api(cfg, "GET", `/admin/reports/v1/activity/users/all/applications/token?${qs}`);
    if (!res.ok) break;
    const json = res.json as {
      items?: Array<{ id?: { time?: string }; actor?: { email?: string }; events?: Array<{ parameters?: Array<{ name?: string; value?: string }> }> }>;
      nextPageToken?: string;
    };
    for (const item of json.items ?? []) {
      const email = item.actor?.email?.toLowerCase();
      const time = item.id?.time;
      if (!email || !time) continue;
      const hit = (item.events ?? []).some((e) => (e.parameters ?? []).some((p) => p.name === "app_name" && p.value?.toLowerCase() === wanted));
      if (!hit) continue;
      const d = new Date(time);
      if (!out.has(email) || out.get(email)! < d) out.set(email, d);
    }
    pageToken = json.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return out;
}
