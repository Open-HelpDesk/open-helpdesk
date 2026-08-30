/**
 * Outbox: every outgoing email goes through here (ST-03).
 *
 * Each send is logged in `email_deliveries` before the attempt, then queued on BullMQ
 * (`mail-send`) so it can be retried on failure. If Redis is unavailable, the send is
 * attempted immediately rather than lost.
 */
import { db, emailDeliveries, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { resolveMailConfig } from "./settings";
import type { MailKind } from "./types";

export const MAIL_SEND_QUEUE = "mail-send";

export type SendTenantEmailInput = {
  tenantId: string;
  to: string;
  subject: string;
  text: string;
  /** Rich part. The text above stays mandatory — see OutgoingEmail. */
  html?: string;
  kind?: MailKind;
  headers?: Record<string, string>;
  ticketId?: string;
  /** Bypasses the queue and sends right away (configuration test). */
  immediate?: boolean;
};

export type SendTenantEmailResult = {
  deliveryId: string;
  queued: boolean;
  sent: boolean;
  messageId?: string;
  from: string;
  error?: string;
};

/**
 * Queue job. The body travels IN the job: the worker is a different process from the
 * web application, it shares no memory with it. The body is never written to the
 * database (personal data) — it only lives for the duration of the job.
 */
export type MailSendJob = {
  deliveryId: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

async function enqueue(job: MailSendJob): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  try {
    const [{ Queue }, { default: IORedis }] = await Promise.all([
      import("bullmq"),
      import("ioredis"),
    ]);
    const connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false });
    const queue = new Queue(MAIL_SEND_QUEUE, { connection });
    await queue.add(
      "send",
      job,
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    );
    await queue.close();
    await connection.quit();
    return true;
  } catch (err) {
    console.error("[mail] could not enqueue, sending directly:", err);
    return false;
  }
}

/**
 * Sends (or queues) an email for a tenant. Always returns the log identifier: the
 * caller can display the state without waiting for the actual send.
 */
export async function sendTenantEmail(
  input: SendTenantEmailInput,
): Promise<SendTenantEmailResult> {
  const config = await resolveMailConfig(input.tenantId, input.kind);

  const [delivery] = await db
    .insert(emailDeliveries)
    .values({
      tenantId: input.tenantId,
      toAddress: input.to,
      subject: input.subject,
      kind: input.kind ?? "other",
      provider: config.provider,
      status: "queued",
      ticketId: input.ticketId ?? null,
    })
    .returning();
  const deliveryId = delivery!.id;

  if (
    !input.immediate &&
    (await enqueue({ deliveryId, text: input.text, html: input.html, headers: input.headers }))
  ) {
    return { deliveryId, queued: true, sent: false, from: config.from };
  }

  const result = await deliverEmail(deliveryId, {
    text: input.text,
    html: input.html,
    headers: input.headers,
  });
  return { deliveryId, queued: false, ...result };
}

/** Performs the send of a logged delivery. Called directly or by the worker. */
export async function deliverEmail(
  deliveryId: string,
  body: { text: string; html?: string; headers?: Record<string, string> },
): Promise<{ sent: boolean; messageId?: string; error?: string; from: string }> {
  const [delivery] = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.id, deliveryId));
  if (!delivery) return { sent: false, error: "Livraison introuvable", from: "" };

  // Suspended tenant: outbound is cut off (inbound keeps being ingested).
  // sent:true = "handled" — the delivery is marked as failed, without a BullMQ retry.
  //
  // "admin" is the exception, and it has to be: an email that tells the owner
  // their workspace is suspended is the only way they learn it, and cutting it
  // off along with the customer traffic left them with a locked workspace and
  // no notice. Those messages go to the workspace's own people, never to its
  // customers.
  const [tenantRow] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, delivery.tenantId));
  if (
    tenantRow &&
    tenantRow.status !== "active" &&
    tenantRow.status !== "trial" &&
    delivery.kind !== "admin"
  ) {
    await db
      .update(emailDeliveries)
      .set({ status: "failed", error: "tenant_suspended" })
      .where(eq(emailDeliveries.id, deliveryId));
    return { sent: true, from: "" };
  }

  const config = await resolveMailConfig(delivery.tenantId, delivery.kind as MailKind);
  const { text, html, headers } = body;

  try {
    const { messageId } = await config.transport.send({
      from: config.from,
      to: delivery.toAddress,
      replyTo: config.replyTo,
      subject: delivery.subject,
      text,
      html,
      headers,
    });
    await db
      .update(emailDeliveries)
      .set({
        status: "sent",
        provider: config.provider,
        providerMessageId: messageId ?? null,
        attempts: delivery.attempts + 1,
        sentAt: new Date(),
        error: null,
      })
      .where(eq(emailDeliveries.id, deliveryId));
    return { sent: true, messageId, from: config.from };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(emailDeliveries)
      .set({
        status: "failed",
        provider: config.provider,
        attempts: delivery.attempts + 1,
        error: message.slice(0, 1000),
      })
      .where(eq(emailDeliveries.id, deliveryId));
    console.error(`[mail] send failed (${deliveryId}):`, message);
    return { sent: false, error: message, from: config.from };
  }
}
