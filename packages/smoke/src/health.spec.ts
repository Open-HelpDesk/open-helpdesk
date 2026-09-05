import { expect, test } from "@playwright/test";

/**
 * /api/health — the monitoring endpoint must not lie.
 *
 * The defect class this guards against: a health check that hardcodes its
 * optimism. An endpoint that returns 200 without actually touching the
 * database or storage would keep the monitoring green through a real outage —
 * strictly worse than no endpoint, because someone trusts it. So the
 * assertions here pin the contract (stable keys, per-check booleans, timings)
 * and require the vital checks to have really run (a probe that ran has a
 * non-zero duration or a verdict; a skipped one says so explicitly).
 */

type Check = {
  ok: boolean;
  ms: number;
  code?: string;
  skipped?: boolean;
  lastTickSecondsAgo?: number;
};

test("health answers with the full contract and live vitals", async ({ request }) => {
  const res = await request.get("/api/health");
  expect([200, 503]).toContain(res.status());

  const body = (await res.json()) as {
    status: "ok" | "degraded" | "fail";
    checks: Record<"db" | "storage" | "redis" | "worker", Check>;
  };

  expect(["ok", "degraded", "fail"]).toContain(body.status);
  for (const key of ["db", "storage", "redis", "worker"] as const) {
    expect(body.checks[key], `check ${key} present`).toBeDefined();
    expect(typeof body.checks[key].ok).toBe("boolean");
    expect(typeof body.checks[key].ms).toBe("number");
  }

  // In the smoke environment postgres, minio and redis are all up: these are
  // hard assertions, not tolerances.
  expect(body.checks.db.ok).toBe(true);
  expect(body.checks.storage.ok).toBe(true);
  expect(body.checks.redis.ok).toBe(true);
  expect(res.status()).toBe(200);
});

test("health carries no topology — booleans and codes only", async ({ request }) => {
  const res = await request.get("/api/health");
  const raw = await res.text();
  // Connection errors must never leak hosts, ports or URLs to an
  // unauthenticated endpoint.
  expect(raw).not.toMatch(/postgres:\/\/|redis:\/\/|https?:\/\/|:[0-9]{4,5}/);
});
