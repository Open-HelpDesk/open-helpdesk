import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { lt } from "drizzle-orm";
import { db, rejectedEmails, ssoAuthEvents } from "@openhelpdesk/db";
import {
  deliverEmail,
  ingestEmail,
  pollAllImapMailboxes,
  type InboundEmail,
  type MailSendJob,
} from "@openhelpdesk/mail";
import { onContactMessage, onTicketCreated, runScheduledRules, scanSlaTimers } from "@openhelpdesk/rules";
import { reindexEnabledWorkspaces, sweepDeflections } from "@openhelpdesk/ee-ai";
import { deliverWebhookJob, type WebhookJob } from "@openhelpdesk/webhooks";
import { deliverPushJob, type PushJob } from "@openhelpdesk/push";
import { executeRun, parseZendeskExport, reapStaleRuns, type ImportSource } from "@openhelpdesk/import";
import { QUEUE_NAMES, type QueueName } from "./queues";

/**
 * An import queued by the admin screen.
 *
 * The export travels in the job rather than being re-fetched: a run must import
 * exactly what the customer approved during the rehearsal, not whatever the
 * other product happens to return an hour later.
 */
type ImportRunJob = {
  runId: string;
  tenantId: string;
  source: ImportSource;
  dryRun: boolean;
  startedById?: string | null;
  payload: Parameters<typeof parseZendeskExport>[0];
};

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  // Required by BullMQ: commands must not be dropped during a reconnection.
  maxRetriesPerRequest: null,
});

const DAY_MS = 24 * 3600 * 1000;

/** Processors, one per queue. */
const processors: Record<QueueName, Processor> = {
  "sla-timers": async () => {
    const { warned, breached } = await scanSlaTimers();
    if (warned || breached) {
      console.log(`[sla-timers] ${warned} warning(s), ${breached} breach(es)`);
    }
  },
  "mail-ingest": async (job) => {
    // The IMAP poller (self-hosted) publishes normalized InboundEmail into this
    // queue; in control-plane deployments, the /api/ingress/email webhook calls
    // ingestEmail directly.
    const result = await ingestEmail(job.data as InboundEmail);
    if (result.outcome === "created") await onTicketCreated(result.tenantId, result.ticketId);
    if (result.outcome === "appended") await onContactMessage(result.tenantId, result.ticketId);
    console.log(`[mail-ingest] job ${job.id} → ${result.outcome}`);
    return result;
  },
  "mail-send": async (job) => {
    const { deliveryId, text, html, headers } = job.data as MailSendJob;
    const result = await deliverEmail(deliveryId, { text, html, headers });
    // Throwing the error lets BullMQ retry with its exponential backoff.
    if (!result.sent) throw new Error(result.error ?? "send failed");
    console.log(`[mail-send] delivery ${deliveryId} sent (${result.messageId ?? "no id"})`);
  },
  "imap-poll": async () => {
    const polls = await pollAllImapMailboxes();
    for (const poll of polls) {
      if (poll.error) {
        console.error(`[imap-poll] ${poll.address} : ${poll.error}`);
        continue;
      }
      for (const result of poll.results) {
        if (result.outcome === "created") await onTicketCreated(result.tenantId, result.ticketId);
        if (result.outcome === "appended") await onContactMessage(result.tenantId, result.ticketId);
      }
      if (poll.fetched > 0) {
        console.log(`[imap-poll] ${poll.address}: ${poll.fetched} message(s) picked up`);
      }
    }
  },
  "webhook-dispatch": async (job) => {
    const data = job.data as WebhookJob;
    const { httpStatus } = await deliverWebhookJob(data);
    // Throwing lets BullMQ retry with its backoff; a 2xx (or a hook that no
    // longer exists) is final.
    const ok = httpStatus === null ? false : httpStatus >= 200 && httpStatus < 300;
    if (!ok && httpStatus !== null) throw new Error(`webhook responded ${httpStatus}`);
    console.log(`[webhook-dispatch] ${data.event} → ${httpStatus ?? "no response"}`);
  },
  "push-dispatch": async (job) => {
    const data = job.data as PushJob;
    const { ok, gone } = await deliverPushJob(data);
    /*
     * Throwing lets BullMQ retry: a gateway down for a minute is worth a second
     * attempt. A token the gateway called dead is not — the registration has
     * just been revoked, so every retry would send to something that no longer
     * exists. Retrying that is how a queue spends an afternoon on a wiped phone.
     */
    if (!ok && !gone) throw new Error(`push ${data.notification.event} not delivered`);
    console.log(`[push-dispatch] ${data.notification.event} → ${data.platform}`);
  },
  automations: async () => {
    const applied = await runScheduledRules();
    if (applied) console.log(`[automations] scheduled rules: ${applied} application(s)`);
  },
  housekeeping: async () => {
    // 90-day retention of SSO auth events.
    await db
      .delete(ssoAuthEvents)
      .where(lt(ssoAuthEvents.createdAt, new Date(Date.now() - 90 * DAY_MS)));
    // 30-day retention of the rejected-emails log (ST-03).
    await db
      .delete(rejectedEmails)
      .where(lt(rejectedEmails.createdAt, new Date(Date.now() - 30 * DAY_MS)));
    console.log("[housekeeping] purges done");
  },
  /**
   * Le règlement des déflexions de l'assistant.
   *
   * Dépendance directe sur `ee/ai`, comme `apps/web` en a une sur `ee/web` :
   * la frontière de licence de ce dépôt est juridique et non physique, et
   * prétendre le contraire ici — par un import dynamique qui « survivrait » à
   * un `ee/` absent — décrirait un montage qui ne compile de toute façon pas
   * sans lui.
   */
  "ai-sweep": async () => {
    const out = await sweepDeflections();
    if (out.tenants > 0) {
      console.log(
        `[ai-sweep] ${out.tenants} workspace(s): ${out.confirmed} confirmed, ` +
          `${out.returned} credited back`,
      );
    }
  },
  /**
   * The knowledge layer, kept current.
   *
   * Every six hours rather than on every write: a workspace publishing an
   * article would otherwise pay an embedding per save, and the layer only has
   * to be right by the time someone asks the assistant. The settings screen
   * has a button for those who do not want to wait for the next pass.
   */
  "ai-index": async () => {
    const out = await reindexEnabledWorkspaces();
    if (out.tenants > 0 || out.failed > 0) {
      console.log(
        `[ai-index] ${out.tenants} workspace(s): ${out.indexed} indexed, ` +
          `${out.removed} removed, ${out.failed} failed`,
      );
    }
  },
  "import-run": async (job) => {
    const data = job.data as ImportRunJob;
    const { data: parsed, anomalies } = parseZendeskExport(data.payload);
    const report = await executeRun(data.runId, parsed, {
      tenantId: data.tenantId,
      source: data.source,
      dryRun: data.dryRun,
      startedById: data.startedById ?? null,
    });
    const total = report.tickets.created + report.tickets.skipped;
    console.log(
      `[import-run] ${data.runId}${data.dryRun ? " (rehearsal)" : ""}: ` +
        `${total} ticket(s), ${report.messages.created} message(s), ` +
        `${report.anomalies.length + anomalies.length} anomaly(ies)`,
    );
  },
};

const workers = QUEUE_NAMES.map(
  (name) =>
    new Worker(name, processors[name], {
      connection,
      concurrency: 5,
    }),
);

for (const w of workers) {
  w.on("failed", (job, err) => {
    console.error(`[${w.name}] job ${job?.id} failed:`, err.message);
  });
}

/** Periodic sweeps — repeatable BullMQ schedulers (idempotent). */
async function registerSchedulers() {
  const schedules: Array<[QueueName, number]> = [
    ["sla-timers", 60_000],
    ["imap-poll", 60_000],
    ["automations", 300_000],
    ["housekeeping", DAY_MS],
    /* Toutes les heures : la fenêtre est de 72 h, donc rien n'exige la minute,
       et un balayage horaire garde le compteur du quota juste à l'heure près. */
    ["ai-sweep", 3_600_000],
    ["ai-index", 21_600_000],
  ];
  /*
   * The knowledge layer is indexed once at boot, on top of its schedule.
   *
   * A repeatable scheduler fires after its interval, not on registration: a
   * fresh install would have had an empty knowledge layer for six hours, and
   * during those six hours every reply draft refuses for lack of a source on
   * a install that is in fact correct. That is the first thing anyone trying
   * the assistant would hit.
   */
  await new Queue("ai-index", { connection }).add("boot", {});

  for (const [name, every] of schedules) {
    const queue = new Queue(name, { connection });
    await queue.upsertJobScheduler(`${name}-tick`, { every });
    await queue.close();
    console.log(`[scheduler] ${name} every ${Math.round(every / 1000)} s`);
  }
}

await registerSchedulers();

/*
 * An import interrupted by a restart leaves a row saying "running" that nothing
 * will ever finish, and a screen that spins for ever. Closed at start-up, on
 * the same principle as the mail outbox.
 */
const reaped = await reapStaleRuns();
if (reaped) console.log(`[import-run] ${reaped} interrupted run(s) closed`);

console.log(`Open HelpDesk worker started — queues: ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Stopping the worker…");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
