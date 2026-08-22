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
    const { deliveryId, text, headers } = job.data as MailSendJob;
    const result = await deliverEmail(deliveryId, { text, headers });
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
  ];
  for (const [name, every] of schedules) {
    const queue = new Queue(name, { connection });
    await queue.upsertJobScheduler(`${name}-tick`, { every });
    await queue.close();
    console.log(`[scheduler] ${name} every ${Math.round(every / 1000)} s`);
  }
}

await registerSchedulers();
console.log(`Open HelpDesk worker started — queues: ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Stopping the worker…");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
