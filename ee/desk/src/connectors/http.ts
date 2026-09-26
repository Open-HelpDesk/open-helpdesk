/**
 * The one way connectors talk to the outside: global `fetch` (so tests can
 * intercept it or point base URLs at a local mock), a timeout, and an error
 * that says whose fault a failure is.
 *
 *  - `connector` — the connection itself is broken (bad credentials, host
 *    unreachable, 5xx): the connector turns `error` and the catalogue stops
 *    claiming automatic provisioning for its apps (doctrine: claims are true).
 *  - `item` — this one account failed (user unknown at the IdP, group
 *    missing): a `warn` line, the connector stays healthy.
 */

export class ConnectorError extends Error {
  constructor(
    message: string,
    public scope: "connector" | "item",
    public status: number | null = null,
  ) {
    super(message);
  }
}

export type HttpResult = { status: number; ok: boolean; json: unknown; text: string };

const TIMEOUT_MS = 15_000;

export async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<HttpResult> {
  const { timeoutMs = TIMEOUT_MS, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new ConnectorError(`${new URL(url).host} unreachable: ${why}`, "connector");
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: res.status, ok: res.ok, json, text };
}

/** A short, secret-free description of an HTTP failure. */
export function describe(res: HttpResult, what: string): string {
  const j = res.json as Record<string, unknown> | null;
  const detail =
    (j && typeof j.detail === "string" && j.detail) ||
    (j && typeof j.error_description === "string" && j.error_description) ||
    (j && typeof j.error === "object" && j.error && typeof (j.error as Record<string, unknown>).message === "string" && (j.error as Record<string, unknown>).message) ||
    (j && typeof j.error === "string" && j.error) ||
    res.text.slice(0, 160);
  return `${what}: HTTP ${res.status}${detail ? ` — ${String(detail).split("\n")[0]}` : ""}`;
}

/** Classifies a failed response: credentials and server faults break the connector. */
export function failure(res: HttpResult, what: string): ConnectorError {
  const scope = res.status === 401 || res.status === 403 || res.status >= 500 ? "connector" : "item";
  return new ConnectorError(describe(res, what), scope, res.status);
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
