import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProvisionInput } from "@openhelpdesk/desk";
import { startMockScimApp, type MockScimApp } from "../testing/mock-scim-app";
import { entraAddMember, entraConfig, entraRemoveMember } from "./entra";
import { googleAddMember, googleConfig, googleRemoveMember } from "./google";
import { ConnectorError } from "./http";
import { scimProvisioner } from "./scim-out";
import type { LoadedConnector } from "./store";

const input = (over: Partial<ProvisionInput> = {}): ProvisionInput => ({
  tenantId: "t",
  connectorId: null,
  app: { id: "a", slug: "figma", name: "Figma", scimBaseUrl: null, scimToken: "tok-figma" },
  tier: { id: "tier", name: "Editor", externalGroup: "app-figma-editor" },
  person: { id: "p-1", email: "lea.martin@acme.example", name: "Léa Martin", externalId: null, department: "Sales" },
  externalAccountId: null,
  ...over,
});

describe("outbound SCIM against a SCIM application", () => {
  let app: MockScimApp;
  beforeAll(async () => {
    app = await startMockScimApp({ token: "tok-figma" });
  });
  afterAll(() => app.close());
  const on = (over: Partial<ProvisionInput> = {}) => input({ app: { ...input().app, scimBaseUrl: app.url }, ...over });

  it("creates, then adopts on a second create (idempotent)", async () => {
    const { externalAccountId } = await scimProvisioner.create(on());
    expect(app.users.get(externalAccountId)).toMatchObject({ userName: "lea.martin@acme.example", active: true, externalId: "p-1" });
    const again = await scimProvisioner.create(on());
    expect(again.externalAccountId).toBe(externalAccountId);
    expect(app.users.size).toBe(1);
  });

  it("adopts on 409 when the lookup missed the user", async () => {
    const before = app.users.size;
    // The lookup (GET) answers an empty list once — as an eventually consistent app would.
    const realFetch = globalThis.fetch;
    let first = true;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (first && (init?.method ?? "GET") === "GET") {
        first = false;
        return new Response(JSON.stringify({ Resources: [], totalResults: 0 }), { status: 200 });
      }
      return realFetch(url, init);
    });
    const { externalAccountId } = await scimProvisioner.create(on());
    vi.unstubAllGlobals();
    expect(app.users.size).toBe(before);
    expect(app.requests.some((r) => r.method === "POST")).toBe(true);
    expect(app.users.get(externalAccountId)?.userName).toBe("lea.martin@acme.example");
  });

  it("disables, reactivates on create, then deletes", async () => {
    const { externalAccountId: id } = await scimProvisioner.create(on());
    await scimProvisioner.disable(on({ externalAccountId: id }));
    expect(app.users.get(id)?.active).toBe(false);
    await scimProvisioner.create(on());
    expect(app.users.get(id)?.active).toBe(true);
    await scimProvisioner.delete(on({ externalAccountId: id }));
    expect(app.users.has(id)).toBe(false);
    // Deleting again is not an error: already done.
    await scimProvisioner.delete(on({ externalAccountId: id }));
    await scimProvisioner.disable(on({ externalAccountId: id }));
  });

  it("classifies a bad token as a connector failure", async () => {
    const err = await scimProvisioner.create(on({ app: { ...on().app, scimToken: "wrong" } })).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.scope).toBe("connector");
    expect(err.message).toContain("HTTP 401");
  });

  it("refuses without a base URL", async () => {
    await expect(scimProvisioner.create(input())).rejects.toThrow(/no SCIM base URL/);
  });
});

/* ---------------- Entra ID (fetch intercepted) ---------------- */

type Call = { method: string; url: string; body: string | null };

function fakeFetch(handler: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(url), body: (init?.body as string) ?? null };
    calls.push(c);
    const r = handler(c);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  });
  return calls;
}

const connector = (kind: "entra" | "google", settings: Record<string, unknown>, secrets: Record<string, string>): LoadedConnector => ({
  id: "c",
  tenantId: "t",
  kind,
  name: kind,
  status: "connected",
  settings,
  secrets,
});

afterEach(() => vi.unstubAllGlobals());

describe("Entra ID group membership", () => {
  const cfg = () =>
    entraConfig(
      connector("entra", { graphBaseUrl: "https://graph.test", loginBaseUrl: "https://login.test" }, { tenantId: "dir-1", clientId: "cid", clientSecret: `s-${Math.random()}` }),
    );
  const USER = "11111111-2222-3333-4444-555555555555";
  const GROUP = "99999999-8888-7777-6666-555555555555";

  it("gets a token, finds user and group, adds the member", async () => {
    const calls = fakeFetch((c) => {
      if (c.url.startsWith("https://login.test/dir-1/oauth2/v2.0/token")) return { status: 200, body: { access_token: "AT", expires_in: 3600 } };
      if (c.url.includes("/v1.0/users/lea.martin%40acme.example")) return { status: 200, body: { id: USER } };
      if (c.url.includes("/v1.0/groups?$filter=")) return { status: 200, body: { value: [{ id: GROUP }] } };
      if (c.url.endsWith(`/v1.0/groups/${GROUP}/members/$ref`) && c.method === "POST") return { status: 204 };
      return { status: 500 };
    });
    const id = await entraAddMember(cfg(), input());
    expect(id).toBe(USER);
    const token = calls[0]!;
    expect(token.body).toContain("grant_type=client_credentials");
    expect(token.body).toContain("scope=https%3A%2F%2Fgraph.test%2F.default");
    const add = calls.find((c) => c.method === "POST" && c.url.includes("/members/$ref"))!;
    expect(JSON.parse(add.body!)).toEqual({ "@odata.id": `https://graph.test/v1.0/directoryObjects/${USER}` });
    expect(decodeURIComponent(calls.find((c) => c.url.includes("/groups?"))!.url)).toContain("displayName eq 'app-figma-editor'");
  });

  it("treats 'already a member' as done, and removal of a non-member as done", async () => {
    fakeFetch((c) => {
      if (c.url.includes("/token")) return { status: 200, body: { access_token: "AT" } };
      if (c.method === "POST") return { status: 400, body: { error: { message: "One or more added object references already exist for the following modified properties: 'members'." } } };
      if (c.method === "DELETE") return { status: 404 };
      return { status: 500 };
    });
    const withIds = input({ externalAccountId: USER, tier: { id: "t", name: "Editor", externalGroup: GROUP } });
    await expect(entraAddMember(cfg(), withIds)).resolves.toBe(USER);
    await expect(entraRemoveMember(cfg(), withIds)).resolves.toBeUndefined();
  });

  it("a rejected secret is a connector failure", async () => {
    fakeFetch(() => ({ status: 401, body: { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided." } }));
    const err = await entraAddMember(cfg(), input()).catch((e) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.scope).toBe("connector");
    expect(err.message).toContain("AADSTS7000215");
  });

  it("an unknown user is an item failure", async () => {
    fakeFetch((c) => {
      if (c.url.includes("/token")) return { status: 200, body: { access_token: "AT" } };
      if (c.url.includes("/v1.0/users/")) return { status: 404 };
      if (c.url.includes("/v1.0/users?")) return { status: 200, body: { value: [] } };
      return { status: 500 };
    });
    const err = await entraAddMember(cfg(), input()).catch((e) => e);
    expect(err.scope).toBe("item");
  });
});

/* ---------------- Google Workspace (fetch intercepted) ---------------- */

describe("Google Workspace group membership", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const cfg = () =>
    googleConfig(
      connector(
        "google",
        { adminEmail: "admin@acme.example", domain: "acme.example", apiBaseUrl: "https://admin.test", tokenUrl: `https://oauth.test/token-${Math.random()}` },
        { serviceAccountKey: JSON.stringify({ client_email: "desk@proj.iam.gserviceaccount.com", private_key: pem }) },
      ),
    );

  it("signs a delegated RS256 assertion and inserts the member", async () => {
    let assertion = "";
    const calls = fakeFetch((c) => {
      if (c.url.startsWith("https://oauth.test/")) {
        assertion = new URLSearchParams(c.body!).get("assertion")!;
        return { status: 200, body: { access_token: "GT", expires_in: 3600 } };
      }
      if (c.method === "POST" && c.url === "https://admin.test/admin/directory/v1/groups/app-figma-editor%40acme.example/members") return { status: 200, body: { id: "m-1" } };
      return { status: 500 };
    });
    const id = await googleAddMember(cfg(), input());
    expect(id).toBe("m-1");
    const [h, p, s] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims).toMatchObject({ iss: "desk@proj.iam.gserviceaccount.com", sub: "admin@acme.example" });
    expect(claims.scope).toContain("admin.directory.group.member");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
    expect(JSON.parse(calls.find((c) => c.method === "POST" && c.url.includes("/members"))!.body!)).toEqual({ email: "lea.martin@acme.example", role: "MEMBER" });
  });

  it("409 on insert and 404 on delete are both done", async () => {
    fakeFetch((c) => {
      if (c.url.startsWith("https://oauth.test/")) return { status: 200, body: { access_token: "GT" } };
      if (c.method === "POST") return { status: 409, body: { error: { message: "Member already exists." } } };
      if (c.method === "DELETE") return { status: 404 };
      return { status: 500 };
    });
    await expect(googleAddMember(cfg(), input())).resolves.toBe("lea.martin@acme.example");
    await expect(googleRemoveMember(cfg(), input())).resolves.toBeUndefined();
  });

  it("a tier without a group is an item failure", async () => {
    fakeFetch(() => ({ status: 200, body: { access_token: "GT" } }));
    const err = await googleAddMember(cfg(), input({ tier: { id: "t", name: "Viewer", externalGroup: null } })).catch((e) => e);
    expect(err.scope).toBe("item");
  });
});
