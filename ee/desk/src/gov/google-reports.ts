/**
 * Google Workspace Admin Reports — the "token" activity (OAuth grants made by
 * users to third-party apps), read with the Google connector's service account
 * (domain-wide delegation, impersonating `settings.adminEmail`).
 *
 * Minimal and fetch-based: a signed JWT, one token exchange, paginated reads.
 * Only what shadow IT discovery needs.
 */
import { createSign } from "node:crypto";
import { ConnectorError, failure, http } from "../connectors/http";

const REPORTS_SCOPE = "https://www.googleapis.com/auth/admin.reports.audit.readonly";
const REPORTS_URL = "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/token";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null;
  try {
    const sa = JSON.parse(json) as Partial<ServiceAccount>;
    if (typeof sa.client_email !== "string" || typeof sa.private_key !== "string") return null;
    return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri };
  } catch {
    return null;
  }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function accessToken(sa: ServiceAccount, subject: string): Promise<string> {
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, sub: subject, scope: REPORTS_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await http(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const token = (res.json as { access_token?: string } | null)?.access_token;
  if (!res.ok || !token) throw failure(res, "Google token exchange");
  return token;
}

export type OAuthGrant = { clientId: string; appName: string; userEmail: string; scopes: string[]; at: Date };

type Param = { name?: string; value?: string; multiValue?: string[] };
type Activity = {
  id?: { time?: string };
  actor?: { email?: string };
  events?: Array<{ name?: string; parameters?: Param[] }>;
};

/** Every `authorize` event since `since` — one entry per (user, app) grant event. */
export async function listOAuthGrants(serviceAccountJson: string | undefined, adminEmail: string, since: Date): Promise<OAuthGrant[]> {
  const sa = parseServiceAccount(serviceAccountJson);
  if (!sa) throw new ConnectorError("Google service account JSON is missing or invalid", "connector");
  const token = await accessToken(sa, adminEmail);
  const out: OAuthGrant[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL(REPORTS_URL);
    url.searchParams.set("eventName", "authorize");
    url.searchParams.set("startTime", since.toISOString());
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await http(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw failure(res, "Google Reports token activity");
    const body = res.json as { items?: Activity[]; nextPageToken?: string } | null;
    for (const item of body?.items ?? []) {
      const email = item.actor?.email;
      if (!email) continue;
      for (const ev of item.events ?? []) {
        if (ev.name !== "authorize") continue;
        const p = (n: string) => ev.parameters?.find((x) => x.name === n);
        const clientId = p("client_id")?.value;
        const appName = p("app_name")?.value;
        if (!clientId || !appName) continue;
        out.push({
          clientId,
          appName,
          userEmail: email.toLowerCase(),
          scopes: p("scope")?.multiValue ?? (p("scope")?.value ? [p("scope")!.value!] : []),
          at: item.id?.time ? new Date(item.id.time) : new Date(),
        });
      }
    }
    pageToken = body?.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/**
 * Risk from the scopes granted — a deterministic rule, never a model. The
 * reason is a stable code the screen translates.
 */
export function riskOfScopes(scopes: string[]): { risk: "low" | "medium" | "high"; reason: string } {
  const has = (re: RegExp) => scopes.some((s) => re.test(s));
  if (has(/^https:\/\/mail\.google\.com\/?$|\/auth\/gmail\.(modify|compose|send|insert)$/)) return { risk: "high", reason: "gmail_full" };
  if (has(/\/auth\/admin\./)) return { risk: "high", reason: "admin" };
  if (has(/\/auth\/drive$/)) return { risk: "high", reason: "drive_full" };
  if (has(/\/auth\/gmail\.readonly$/)) return { risk: "medium", reason: "gmail_read" };
  if (has(/\/auth\/(drive\.readonly|drive\.file|documents|spreadsheets|presentations)/)) return { risk: "medium", reason: "drive_files" };
  if (has(/\/auth\/(calendar|contacts|directory)/)) return { risk: "medium", reason: "calendar_contacts" };
  return { risk: "low", reason: "basic_profile" };
}
