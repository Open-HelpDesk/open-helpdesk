/**
 * Installation diagnostics (ST-01, "Installation health" card): six probes
 * bounded to 5 s each, run at the server render of the General page when
 * `?diag=1`. Nothing is persisted — the displayed result IS the last run.
 * Generalises the contract of the ST-03 email test
 * (`MailTransport.verify() → { ok, detail }`).
 *
 * Side effects accepted and displayed: the storage probe writes then deletes a
 * witness object; the IMAP and Redis probes open then close a connection. None
 * of them sends an email or creates a row in the database.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, mailboxes } from "@openhelpdesk/db";
import { resolveMailConfig, verifyImapMailbox } from "@openhelpdesk/mail";
import { encryptionKeySource } from "@openhelpdesk/crypto";
import { probeStorage } from "@/lib/storage";
import type { Translate } from "@/i18n/server";

export type ProbeStatus = "ok" | "warn" | "fail";
export type ProbeId = "db" | "mailOut" | "mailIn" | "storage" | "queue" | "crypto";
export type ProbeResult = { id: ProbeId; status: ProbeStatus; detail: string; ms: number };

type ProbeOutcome = { status: ProbeStatus; detail: string };

const PROBE_TIMEOUT_MS = 5_000;

/** Age beyond which the last sla-timers tick (60 s) signals a stopped worker. */
const WORKER_STALE_MS = 3 * 60_000;

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("diag-timeout")), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, gate]);
  } finally {
    clearTimeout(timer);
  }
}

function errorDetail(err: unknown): string {
  // Network AggregateErrors (ECONNREFUSED) often have an empty message: we fall
  // back on the code then the name so as never to display a mute row.
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return err.message || code || err.name;
  }
  return String(err);
}

/** select 1 — if the database is dead, the whole page fails before this card. */
async function probeDb(t: Translate): Promise<ProbeOutcome> {
  await db.execute(sql`select 1`);
  return { status: "ok", detail: t("app.settings.workspace.diagDetailOk") };
}

/** Cascade tenant → instance → console: verify() of the resolved transport. */
async function probeMailOut(t: Translate, tenantId: string): Promise<ProbeOutcome> {
  const config = await resolveMailConfig(tenantId);
  if (config.source === "default") {
    return { status: "warn", detail: t("app.settings.workspace.diagMailOutNone") };
  }
  if (!config.transport.verify) {
    return { status: "warn", detail: t("app.settings.email.connectionNoVerify") };
  }
  const result = await config.transport.verify();
  return { status: result.ok ? "ok" : "fail", detail: result.detail };
}

/** Inbound webhook secret + real connection of every IMAP mailbox of the tenant. */
async function probeMailIn(t: Translate, tenantId: string): Promise<ProbeOutcome> {
  const secret = process.env.MAIL_INGRESS_SECRET;
  const devSecret = !secret || secret === "dev-ingress-secret";

  const rows = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.tenantId, tenantId), eq(mailboxes.kind, "imap")));

  for (const row of rows) {
    const result = await verifyImapMailbox(row);
    if (!result.ok) {
      return { status: "fail", detail: `${row.address}: ${result.detail}` };
    }
  }
  if (devSecret) {
    return { status: "warn", detail: t("app.settings.workspace.diagMailInDevSecret") };
  }
  return {
    status: "ok",
    detail:
      rows.length > 0
        ? t("app.settings.workspace.diagMailInImapOk", { count: rows.length })
        : t("app.settings.workspace.diagMailInNoImap"),
  };
}

/** HeadBucket + witness object written then deleted (see probeStorage). */
async function probeStore(t: Translate): Promise<ProbeOutcome> {
  const { bucket } = await probeStorage();
  return { status: "ok", detail: t("app.settings.workspace.diagStorageOk", { bucket }) };
}

/**
 * Redis alive ≠ worker alive: after the ping, we read the age of the last
 * completed `sla-timers` job (60 s tick on the worker side). Mirrors the lazy
 * imports of packages/mail/src/outbox.ts — without REDIS_URL, the web degrades
 * to direct sending and the SLA timers do not run: warn, not fail.
 */
async function probeQueue(t: Translate): Promise<ProbeOutcome> {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { status: "warn", detail: t("app.settings.workspace.diagQueueNoUrl") };
  }
  const [{ Queue }, { default: IORedis }] = await Promise.all([
    import("bullmq"),
    import("ioredis"),
  ]);
  const connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  try {
    await connection.connect();
    await connection.ping();
    const queue = new Queue("sla-timers", { connection });
    try {
      const [job] = await queue.getJobs(["completed"], 0, 0, false);
      if (!job?.finishedOn) {
        return { status: "warn", detail: t("app.settings.workspace.diagQueueWorkerNever") };
      }
      const finishedAt = new Date(job.finishedOn);
      const stale = Date.now() - job.finishedOn > WORKER_STALE_MS;
      return {
        status: stale ? "warn" : "ok",
        detail: t(
          stale
            ? "app.settings.workspace.diagQueueWorkerStale"
            : "app.settings.workspace.diagQueueWorkerOk",
          { time: t.fmt.relative(finishedAt) },
        ),
      };
    } finally {
      await queue.close();
    }
  } finally {
    connection.disconnect();
  }
}

/** Provenance of the encryption key for secrets at rest (packages/crypto). */
async function probeCrypto(t: Translate): Promise<ProbeOutcome> {
  const source = encryptionKeySource();
  if (source === "explicit") {
    return { status: "ok", detail: t("app.settings.workspace.diagDetailOk") };
  }
  if (source === "derived") {
    return { status: "warn", detail: t("app.settings.workspace.diagCryptoDerived") };
  }
  return { status: "fail", detail: t("app.settings.workspace.diagCryptoDev") };
}

/** The six probes, timed, in parallel — one failure does not prevent the others. */
export async function runDiagnostics(tenantId: string, t: Translate): Promise<ProbeResult[]> {
  const probes: Array<[ProbeId, () => Promise<ProbeOutcome>]> = [
    ["db", () => probeDb(t)],
    ["mailOut", () => probeMailOut(t, tenantId)],
    ["mailIn", () => probeMailIn(t, tenantId)],
    ["storage", () => probeStore(t)],
    ["queue", () => probeQueue(t)],
    ["crypto", () => probeCrypto(t)],
  ];

  return Promise.all(
    probes.map(async ([id, run]) => {
      const start = performance.now();
      try {
        const outcome = await withTimeout(run());
        return { id, ...outcome, ms: Math.round(performance.now() - start) };
      } catch (err) {
        const timeout = err instanceof Error && err.message === "diag-timeout";
        return {
          id,
          status: "fail" as const,
          detail: timeout ? t("app.settings.workspace.diagTimeout") : errorDetail(err),
          ms: Math.round(performance.now() - start),
        };
      }
    }),
  );
}
