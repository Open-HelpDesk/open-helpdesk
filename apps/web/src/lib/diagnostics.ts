/**
 * Diagnostic de l'installation (ST-01, carte « Santé de l'installation ») :
 * six sondes bornées à 5 s chacune, exécutées au rendu serveur de la page
 * Général quand `?diag=1`. Rien n'est persisté — le résultat affiché EST le
 * dernier run. Généralise le contrat du test email de ST-03
 * (`MailTransport.verify() → { ok, detail }`).
 *
 * Effets de bord assumés et affichés : la sonde stockage écrit puis supprime
 * un objet témoin ; les sondes IMAP et Redis ouvrent puis ferment une
 * connexion. Aucune n'envoie d'email ni ne crée de ligne en base.
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

/** Âge au-delà duquel le dernier tick sla-timers (60 s) signale un worker arrêté. */
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
  // Les AggregateError réseau (ECONNREFUSED) ont souvent un message vide :
  // on retombe sur le code puis le nom pour ne jamais afficher une ligne muette.
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return err.message || code || err.name;
  }
  return String(err);
}

/** select 1 — si la base est morte, la page entière échoue avant cette carte. */
async function probeDb(t: Translate): Promise<ProbeOutcome> {
  await db.execute(sql`select 1`);
  return { status: "ok", detail: t("app.settings.workspace.diagDetailOk") };
}

/** Cascade tenant → instance → console : verify() du transport résolu. */
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

/** Secret du webhook entrant + connexion réelle de chaque boîte IMAP du tenant. */
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
      return { status: "fail", detail: `${row.address} : ${result.detail}` };
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

/** HeadBucket + objet témoin écrit puis supprimé (voir probeStorage). */
async function probeStore(t: Translate): Promise<ProbeOutcome> {
  const { bucket } = await probeStorage();
  return { status: "ok", detail: t("app.settings.workspace.diagStorageOk", { bucket }) };
}

/**
 * Redis vivant ≠ worker vivant : après le ping, on lit l'âge du dernier job
 * `sla-timers` terminé (tick de 60 s côté worker). Miroir des imports
 * paresseux de packages/mail/src/outbox.ts — sans REDIS_URL, le web dégrade
 * en envoi direct et les minuteurs SLA ne tournent pas : warn, pas fail.
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

/** Provenance de la clé de chiffrement des secrets au repos (packages/crypto). */
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

/** Les six sondes, chronométrées, en parallèle — un échec n'empêche pas les autres. */
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
