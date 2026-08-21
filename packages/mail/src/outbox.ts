/**
 * Boîte d'envoi : tout email sortant passe par ici (ST-03).
 *
 * Chaque envoi est journalisé dans `email_deliveries` avant la tentative, puis mis en
 * file BullMQ (`mail-send`) pour être réessayé en cas d'échec. Si Redis est indisponible,
 * l'envoi est tenté immédiatement plutôt que perdu.
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
  kind?: MailKind;
  headers?: Record<string, string>;
  ticketId?: string;
  /** Ignore la file et envoie tout de suite (test de configuration). */
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
 * Job de la file. Le corps voyage DANS le job : le worker est un autre process que
 * l'application web, il ne partage aucune mémoire avec elle. Le corps n'est jamais
 * écrit en base (données personnelles) — il ne vit que le temps du job.
 */
export type MailSendJob = {
  deliveryId: string;
  text: string;
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
    console.error("[mail] mise en file impossible, envoi direct :", err);
    return false;
  }
}

/**
 * Envoie (ou met en file) un email pour un tenant. Retourne toujours l'identifiant de
 * journal : l'appelant peut afficher l'état sans attendre l'envoi réel.
 */
export async function sendTenantEmail(
  input: SendTenantEmailInput,
): Promise<SendTenantEmailResult> {
  const config = await resolveMailConfig(input.tenantId);

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
    (await enqueue({ deliveryId, text: input.text, headers: input.headers }))
  ) {
    return { deliveryId, queued: true, sent: false, from: config.from };
  }

  const result = await deliverEmail(deliveryId, {
    text: input.text,
    headers: input.headers,
  });
  return { deliveryId, queued: false, ...result };
}

/** Effectue l'envoi d'une livraison journalisée. Appelé en direct ou par le worker. */
export async function deliverEmail(
  deliveryId: string,
  body: { text: string; headers?: Record<string, string> },
): Promise<{ sent: boolean; messageId?: string; error?: string; from: string }> {
  const [delivery] = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.id, deliveryId));
  if (!delivery) return { sent: false, error: "Livraison introuvable", from: "" };

  // Tenant suspendu : le sortant est coupé (l'entrant continue d'être ingéré).
  // sent:true = « traité » — la livraison est marquée en échec, sans retry BullMQ.
  const [tenantRow] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, delivery.tenantId));
  if (tenantRow && tenantRow.status !== "active" && tenantRow.status !== "trial") {
    await db
      .update(emailDeliveries)
      .set({ status: "failed", error: "tenant_suspended" })
      .where(eq(emailDeliveries.id, deliveryId));
    return { sent: true, from: "" };
  }

  const config = await resolveMailConfig(delivery.tenantId);
  const { text, headers } = body;

  try {
    const { messageId } = await config.transport.send({
      from: config.from,
      to: delivery.toAddress,
      replyTo: config.replyTo,
      subject: delivery.subject,
      text,
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
    console.error(`[mail] échec d'envoi (${deliveryId}) :`, message);
    return { sent: false, error: message, from: config.from };
  }
}
