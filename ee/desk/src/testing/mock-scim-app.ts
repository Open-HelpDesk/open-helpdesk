/**
 * A stand-in for a SaaS application that exposes SCIM 2.0 (the Figma or
 * Slack side of outbound provisioning): an in-memory user store behind
 * node:http, with a bearer token, the userName filter, POST (409 on a
 * duplicate userName), PUT, PATCH replace (with or without path) and DELETE.
 *
 * Used by the end-to-end test, and runnable by hand:
 *   node --experimental-strip-types ee/desk/src/testing/mock-scim-app.ts 4010 secret-token
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type MockUser = {
  id: string;
  userName: string;
  active: boolean;
  displayName?: string;
  externalId?: string;
  name?: Record<string, unknown>;
  emails?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export type MockScimApp = {
  url: string;
  users: Map<string, MockUser>;
  requests: Array<{ method: string; path: string; body: unknown }>;
  /** Make the next N requests fail with this status (to test failure handling). */
  failNext(status: number, times?: number): void;
  close(): Promise<void>;
};

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, body === undefined ? {} : { "content-type": "application/scim+json" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function error(res: ServerResponse, status: number, detail: string, scimType?: string) {
  send(res, status, { schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: String(status), detail, ...(scimType ? { scimType } : {}) });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function resource(u: MockUser) {
  return { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], ...u, meta: { resourceType: "User" } };
}

export async function startMockScimApp(opts: { token: string; port?: number }): Promise<MockScimApp> {
  const users = new Map<string, MockUser>();
  const requests: MockScimApp["requests"] = [];
  let failing: { status: number; times: number } | null = null;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    let body: unknown = null;
    try {
      body = await readBody(req);
    } catch {
      return error(res, 400, "invalid JSON", "invalidSyntax");
    }
    requests.push({ method: req.method ?? "GET", path: url.pathname + url.search, body });

    if (req.headers.authorization !== `Bearer ${opts.token}`) return error(res, 401, "bad token");
    if (failing && failing.times > 0) {
      failing.times--;
      return error(res, failing.status, "injected failure");
    }

    const parts = url.pathname.replace(/^\/scim\/v2/, "").split("/").filter(Boolean);
    if (parts[0] !== "Users") return error(res, 404, "not found");
    const id = parts[1];
    const b = (body ?? {}) as Record<string, unknown>;

    if (req.method === "GET" && !id) {
      const filter = url.searchParams.get("filter");
      let list = [...users.values()];
      if (filter) {
        const m = filter.match(/^userName eq "(.*)"$/);
        if (!m) return error(res, 400, "unsupported filter", "invalidFilter");
        list = list.filter((u) => u.userName.toLowerCase() === m[1]!.toLowerCase());
      }
      const count = Number(url.searchParams.get("count") ?? 100);
      return send(res, 200, {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: list.length,
        startIndex: 1,
        itemsPerPage: Math.min(list.length, count),
        Resources: list.slice(0, count).map(resource),
      });
    }
    if (req.method === "POST" && !id) {
      if (typeof b.userName !== "string") return error(res, 400, "userName required", "invalidValue");
      if ([...users.values()].some((u) => u.userName.toLowerCase() === (b.userName as string).toLowerCase())) {
        return error(res, 409, "userName taken", "uniqueness");
      }
      const { schemas: _s, id: _i, meta: _m, ...rest } = b;
      const user: MockUser = { ...(rest as Omit<MockUser, "id">), id: randomUUID(), userName: b.userName, active: b.active !== false };
      users.set(user.id, user);
      return send(res, 201, resource(user));
    }
    const user = id ? users.get(id) : undefined;
    if (!user) return error(res, 404, "user not found");
    if (req.method === "GET") return send(res, 200, resource(user));
    if (req.method === "PUT") {
      const { schemas: _s, id: _i, meta: _m, ...rest } = b;
      const next: MockUser = { ...(rest as Omit<MockUser, "id">), id: user.id, userName: String(b.userName ?? user.userName), active: b.active !== false };
      users.set(user.id, next);
      return send(res, 200, resource(next));
    }
    if (req.method === "PATCH") {
      for (const op of (b.Operations as Array<{ op: string; path?: string; value?: unknown }>) ?? []) {
        if (op.op.toLowerCase() === "remove" && op.path) delete user[op.path];
        else if (op.path) user[op.path] = op.path === "active" ? op.value === true || op.value === "True" || op.value === "true" : op.value;
        else Object.assign(user, op.value as object);
      }
      return send(res, 200, resource(user));
    }
    if (req.method === "DELETE") {
      users.delete(user.id);
      return send(res, 204);
    }
    return error(res, 405, "method not allowed");
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/scim/v2`,
    users,
    requests,
    failNext(status, times = 1) {
      failing = { status, times };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Run standalone: node --experimental-strip-types mock-scim-app.ts [port] [token]
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.argv[2] ?? 4010);
  const token = process.argv[3] ?? "mock-token";
  startMockScimApp({ token, port }).then((app) => {
    console.log(`mock SCIM app on ${app.url} (token ${token})`);
    setInterval(() => console.log(`${app.users.size} user(s):`, [...app.users.values()].map((u) => `${u.userName}${u.active ? "" : " (inactive)"}`).join(", ")), 10_000);
  });
}
