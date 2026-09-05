/**
 * Machine health for GET /api/health — the monitoring twin of diagnostics.ts.
 * The `?diag=1` card is for humans: translated, tenant-aware, six probes. This
 * one is for machines: tenant-free, stable JSON keys, probed every 30 s by the
 * monitoring stack (and, later, by Open Incident's alert sources), so it only
 * checks the vital organs and never puts connection strings or hostnames in
 * the response — an unauthenticated endpoint must not narrate the topology.
 *
 * Worker liveness is read the same way the settings card reads it: the age of
 * the last completed `sla-timers` tick (the worker completes one every 60 s).
 * No separate heartbeat to maintain — a worker that ticks is a worker that
 * processes.
 */
import { sql } from "drizzle-orm";
import { db } from "@openhelpdesk/db";
import { probeStorage } from "@/lib/storage";

export type HealthCheck = {
  ok: boolean;
  ms: number;
  /** Machine-safe hint: an errno code or "timeout" — never a message. */
  code?: string;
  /** Check not applicable in this deployment (e.g. no REDIS_URL). */
  skipped?: boolean;
  /** worker only: seconds since the last completed sla-timers tick. */
  lastTickSecondsAgo?: number;
};

export type Health = {
  status: "ok" | "degraded" | "fail";
  checks: { db: HealthCheck; storage: HealthCheck; redis: HealthCheck; worker: HealthCheck };
};

const TIMEOUT_MS = 5_000;
/** Same threshold as diagnostics.ts: a 60 s tick older than 3 min = stopped. */
const WORKER_STALE_MS = 3 * 60_000;

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, gate]);
  } finally {
    clearTimeout(timer);
  }
}

function failureCode(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "timeout") return "timeout";
    return (err as NodeJS.ErrnoException).code ?? "error";
  }
  return "error";
}

async function timed(work: () => Promise<Partial<HealthCheck>>): Promise<HealthCheck> {
  const start = performance.now();
  try {
    const extra = await withTimeout(work());
    return { ok: true, ...extra, ms: Math.round(performance.now() - start) };
  } catch (err) {
    return { ok: false, code: failureCode(err), ms: Math.round(performance.now() - start) };
  }
}

/**
 * Redis ping + worker pulse in one connection. Without REDIS_URL the instance
 * runs in the documented degraded mode (inline sending, no SLA timers): both
 * checks are skipped rather than failed — absence is a configuration, not an
 * outage.
 */
async function checkQueueAndWorker(): Promise<{ redis: HealthCheck; worker: HealthCheck }> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return {
      redis: { ok: true, skipped: true, ms: 0 },
      worker: { ok: true, skipped: true, ms: 0 },
    };
  }
  const redis = await timed(async () => {
    const { default: IORedis } = await import("ioredis");
    const connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    try {
      await connection.connect();
      await connection.ping();
    } finally {
      connection.disconnect();
    }
    return {};
  });
  if (!redis.ok) {
    // No Redis, no verdict on the worker: unknown is not "down".
    return { redis, worker: { ok: true, skipped: true, ms: 0 } };
  }
  const worker = await timed(async () => {
    const [{ Queue }, { default: IORedis }] = await Promise.all([import("bullmq"), import("ioredis")]);
    const connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    try {
      await connection.connect();
      const queue = new Queue("sla-timers", { connection });
      try {
        const [job] = await queue.getJobs(["completed"], 0, 0, false);
        if (!job?.finishedOn) {
          // Never ticked yet (fresh boot): degraded, not dead — the route maps
          // this to status "degraded" so a starting stack doesn't page anyone.
          return { lastTickSecondsAgo: -1 };
        }
        const age = Date.now() - job.finishedOn;
        if (age > WORKER_STALE_MS) throw new Error("stale");
        return { lastTickSecondsAgo: Math.round(age / 1000) };
      } finally {
        await queue.close();
      }
    } finally {
      connection.disconnect();
    }
  });
  if (!worker.ok && worker.code === "error") worker.code = "stale";
  return { redis, worker };
}

export async function checkHealth(): Promise<Health> {
  const [dbCheck, storage, queue] = await Promise.all([
    timed(async () => {
      await db.execute(sql`select 1`);
      return {};
    }),
    timed(async () => {
      await probeStorage();
      return {};
    }),
    checkQueueAndWorker(),
  ]);

  const checks = { db: dbCheck, storage, redis: queue.redis, worker: queue.worker };
  const vitals = [dbCheck, storage, queue.redis, queue.worker];
  const anyFail = vitals.some((c) => !c.ok);
  const neverTicked = queue.worker.ok && queue.worker.lastTickSecondsAgo === -1;
  return { status: anyFail ? "fail" : neverTicked ? "degraded" : "ok", checks };
}
