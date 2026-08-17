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
import { QUEUE_NAMES, type QueueName } from "./queues";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  // Requis par BullMQ : pas d'abandon des commandes pendant une reconnexion.
  maxRetriesPerRequest: null,
});

const DAY_MS = 24 * 3600 * 1000;

/** Processeurs par file. */
const processors: Record<QueueName, Processor> = {
  "sla-timers": async () => {
    const { warned, breached } = await scanSlaTimers();
    if (warned || breached) {
      console.log(`[sla-timers] ${warned} avertissement(s), ${breached} dépassement(s)`);
    }
  },
  "mail-ingest": async (job) => {
    // Le poller IMAP (auto-hébergé) publie des InboundEmail normalisés dans cette file ;
    // en cloud, le webhook /api/ingress/email appelle ingestEmail directement.
    const result = await ingestEmail(job.data as InboundEmail);
    if (result.outcome === "created") await onTicketCreated(result.tenantId, result.ticketId);
    if (result.outcome === "appended") await onContactMessage(result.tenantId, result.ticketId);
    console.log(`[mail-ingest] job ${job.id} → ${result.outcome}`);
    return result;
  },
  "mail-send": async (job) => {
    const { deliveryId, text, headers } = job.data as MailSendJob;
    const result = await deliverEmail(deliveryId, { text, headers });
    // Lever l'erreur laisse BullMQ réessayer avec son backoff exponentiel.
    if (!result.sent) throw new Error(result.error ?? "envoi échoué");
    console.log(`[mail-send] livraison ${deliveryId} envoyée (${result.messageId ?? "sans id"})`);
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
        console.log(`[imap-poll] ${poll.address} : ${poll.fetched} message(s) relevé(s)`);
      }
    }
  },
  automations: async () => {
    const applied = await runScheduledRules();
    if (applied) console.log(`[automations] règles horaires : ${applied} application(s)`);
  },
  provisioning: async (job) => {
    console.log(`[provisioning] job ${job.id} — à implémenter (Lot 4)`);
  },
  housekeeping: async () => {
    // Rétention 90 j des événements d'auth SSO (specs/15 § 3).
    await db
      .delete(ssoAuthEvents)
      .where(lt(ssoAuthEvents.createdAt, new Date(Date.now() - 90 * DAY_MS)));
    // Rétention 30 j du journal des emails rejetés (ST-03).
    await db
      .delete(rejectedEmails)
      .where(lt(rejectedEmails.createdAt, new Date(Date.now() - 30 * DAY_MS)));
    console.log("[housekeeping] purges effectuées");
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
    console.error(`[${w.name}] échec du job ${job?.id}:`, err.message);
  });
}

/** Balayages périodiques — schedulers répétables BullMQ (idempotents). */
async function registerSchedulers() {
  const schedules: Array<[QueueName, number]> = [
    ["sla-timers", 60_000],
    ["imap-poll", 60_000],
    ["automations", 300_000],
    ["housekeeping", DAY_MS],
  ];
  for (const [name, every] of schedules) {
    const queue = new Queue(name, { connection });
    await queue.upsertJobScheduler(`${name}-tick`, { every });
    await queue.close();
    console.log(`[scheduler] ${name} toutes les ${Math.round(every / 1000)} s`);
  }
}

await registerSchedulers();
console.log(`Worker Open HelpDesk démarré — files : ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Arrêt du worker…");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
