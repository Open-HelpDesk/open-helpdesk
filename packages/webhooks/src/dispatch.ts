/**
 * Outbound webhooks (ST-10) — the dispatch that was missing.
 *
 * The settings screen has always let a workspace register endpoints and pick
 * events, and it could even resend a delivery. But nothing ever produced the
 * FIRST delivery: no ticket event reached a webhook, so the feature was a
 * console with nothing behind it. This is the wire.
 *
 * Shape follows the mail outbox (packages/mail/src/outbox.ts): queue on BullMQ
 * when Redis is there so a failing endpoint gets retried, deliver inline when it
 * is not, rather than dropping the event.
 */
import { createHmac } from "node:crypto";
import { and, db, eq, webhookDeliveries, webhooks } from "./deps";
import { ticketPayload } from "./payload";

export const WEBHOOK_QUEUE = "webhook-dispatch";

/** The four events the settings screen offers. */
export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.updated",
  "ticket.solved",
  "message.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Queue job. The payload travels IN the job, like the mail outbox: the worker is
 * another process and shares no memory with the web app.
 */
export type WebhookJob = {
  tenantId: string;
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
};

/** After this long failing without a single success, an endpoint is switched off. */
const DISABLE_AFTER_MS = 7 * 24 * 3600 * 1000;
const TIMEOUT_MS = 5000;

/**
 * Performs one delivery: signed POST, log row, and the endpoint's health.
 *
 * The signature is HMAC-SHA256 of the exact body bytes, sent as
 * `x-ohd-signature: sha256=…` — the same scheme `resendDelivery` already used,
 * so a receiver that verified resends keeps working unchanged.
 */
export async function deliverWebhookJob(job: WebhookJob): Promise<{ httpStatus: number | null }> {
  const [hook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.tenantId, job.tenantId), eq(webhooks.id, job.webhookId)));
  // Deleted or switched off between enqueue and delivery: nothing to send.
  if (!hook || !hook.active || hook.disabledAt) return { httpStatus: null };

  const body = JSON.stringify(job.payload);
  const signature = createHmac("sha256", hook.secret).update(body).digest("hex");
  const started = Date.now();
  let httpStatus: number | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ohd-event": job.event,
        "x-ohd-signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    httpStatus = res.status;
  } catch {
    httpStatus = null; // network failure or timeout
  }

  await db.insert(webhookDeliveries).values({
    tenantId: job.tenantId,
    webhookId: hook.id,
    event: job.event,
    httpStatus,
    latencyMs: Date.now() - started,
    payload: job.payload,
  });

  const ok = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  if (ok) {
    // A single success clears the failing streak — the endpoint is back.
    if (hook.failingSince) {
      await db.update(webhooks).set({ failingSince: null }).where(eq(webhooks.id, hook.id));
    }
  } else {
    const since = hook.failingSince ?? new Date();
    const tooLong = Date.now() - since.getTime() >= DISABLE_AFTER_MS;
    await db
      .update(webhooks)
      .set({
        failingSince: since,
        // Switched off rather than retried forever: an endpoint that has been
        // dead for a week is gone, and the log keeps the evidence.
        ...(tooLong ? { active: false, disabledAt: new Date() } : {}),
      })
      .where(eq(webhooks.id, hook.id));
  }

  return { httpStatus };
}

async function enqueue(job: WebhookJob): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  try {
    const [{ Queue }, { default: IORedis }] = await Promise.all([
      import("bullmq"),
      import("ioredis"),
    ]);
    const connection = new IORedis(url, { maxRetriesPerRequest: null });
    const queue = new Queue(WEBHOOK_QUEUE, { connection });
    await queue.add("deliver", job, {
      attempts: 4,
      backoff: { type: "exponential", delay: 20_000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
    await queue.close();
    await connection.quit();
    return true;
  } catch (err) {
    console.error("[webhooks] could not enqueue, delivering inline:", err);
    return false;
  }
}

/**
 * Emits one event to every endpoint subscribed to it in this workspace.
 *
 * Never throws: a webhook is a side effect of someone else's action (an agent
 * replying, an email arriving), and a broken endpoint must not fail that action.
 */
export async function dispatchWebhookEvent(
  tenantId: string,
  event: WebhookEvent,
  ticketId: string,
): Promise<number> {
  try {
    const hooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.tenantId, tenantId), eq(webhooks.active, true)));
    const subscribed = hooks.filter((h) => h.events.includes(event) && !h.disabledAt);
    if (subscribed.length === 0) return 0;

    // Built once: every subscriber gets the same body, so the signature a
    // receiver checks is over identical bytes.
    const ticket = await ticketPayload(tenantId, ticketId);
    if (!ticket) return 0;
    const payload = { event, occurred_at: new Date().toISOString(), ticket };

    let sent = 0;
    for (const hook of subscribed) {
      const job: WebhookJob = { tenantId, webhookId: hook.id, event, payload };
      if (!(await enqueue(job))) await deliverWebhookJob(job);
      sent++;
    }
    return sent;
  } catch (err) {
    console.error(`[webhooks] dispatch of ${event} failed:`, err);
    return 0;
  }
}

/**
 * Ticket property change → `ticket.updated`, plus `ticket.solved` the moment it
 * becomes resolved. Two events rather than one because integrators subscribe to
 * "it is done" far more often than to "something moved".
 */
export async function dispatchTicketChanged(
  tenantId: string,
  ticketId: string,
  previousStatus: string | null,
  nextStatus: string | null,
): Promise<void> {
  await dispatchWebhookEvent(tenantId, "ticket.updated", ticketId);
  if (nextStatus === "resolved" && previousStatus !== "resolved") {
    await dispatchWebhookEvent(tenantId, "ticket.solved", ticketId);
  }
}
