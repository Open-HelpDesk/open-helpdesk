import { Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { ingestEmail, type InboundEmail } from "@openhelpdesk/mail";
import { QUEUE_NAMES, type QueueName } from "./queues";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6380", {
  // Requis par BullMQ : pas d'abandon des commandes pendant une reconnexion.
  maxRetriesPerRequest: null,
});

/** Processeurs par file — squelettes Lot 0, implémentés à partir du Lot 1. */
const processors: Record<QueueName, Processor> = {
  "sla-timers": async (job) => {
    console.log(`[sla-timers] job ${job.id} — à implémenter (Lot 2)`);
  },
  "mail-ingest": async (job) => {
    // Le poller IMAP (auto-hébergé) publie des InboundEmail normalisés dans cette file ;
    // en cloud, le webhook /api/ingress/email appelle ingestEmail directement.
    const result = await ingestEmail(job.data as InboundEmail);
    console.log(`[mail-ingest] job ${job.id} → ${result.outcome}`);
    return result;
  },
  automations: async (job) => {
    console.log(`[automations] job ${job.id} — à implémenter (Lot 2)`);
  },
  provisioning: async (job) => {
    console.log(`[provisioning] job ${job.id} — à implémenter (Lot 4)`);
  },
  housekeeping: async (job) => {
    console.log(`[housekeeping] job ${job.id} — à implémenter (Lot 2)`);
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

console.log(`Worker Open HelpDesk démarré — files : ${QUEUE_NAMES.join(", ")}`);

async function shutdown() {
  console.log("Arrêt du worker…");
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
