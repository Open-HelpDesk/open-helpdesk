"use server";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { apiKeys, db, webhookDeliveries, webhooks } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "../guard";

export type NewKeyState = { key: string; name: string } | null;

const SCOPE_SETS: Record<string, string[]> = {
  read: ["read"],
  read_write: ["read", "write"],
  ticket_create: ["ticket:create"],
};

/**
 * ST-10 — Key creation: `ohd_live_` + randomness, SHA-256 hash stored, masked
 * prefix `ohd_live_xxxx…yyyy` safe to display. The full key is returned only ONCE.
 */
export async function createApiKey(_prev: NewKeyState, formData: FormData): Promise<NewKeyState> {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const scopeKey = String(formData.get("scopes") ?? "read");
  if (!name) return null;

  const random = randomBytes(16).toString("hex");
  const key = `ohd_live_${random}`;
  const prefix = `ohd_live_${random.slice(0, 4)}…${random.slice(-4)}`;
  const hashedKey = createHash("sha256").update(key).digest("hex");

  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    name,
    prefix,
    hashedKey,
    scopes: SCOPE_SETS[scopeKey] ?? SCOPE_SETS.read!,
  });

  revalidatePath("/app/settings/api");
  return { key, name };
}

export async function revokeApiKey(formData: FormData) {
  const { tenant } = await requireManager();
  const keyId = String(formData.get("keyId") ?? "");
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.tenantId, tenant.id), eq(apiKeys.id, keyId)));
  revalidatePath("/app/settings/api");
}

/* ---------- Webhooks ---------- */

const WEBHOOK_EVENTS = new Set([
  "ticket.created",
  "ticket.updated",
  "ticket.solved",
  "message.created",
]);

export async function createWebhook(formData: FormData) {
  const { tenant } = await requireManager();
  const url = String(formData.get("url") ?? "").trim();
  const events = formData
    .getAll("events")
    .map(String)
    .filter((e) => WEBHOOK_EVENTS.has(e));
  if (!/^https:\/\/.+/.test(url) || events.length === 0) return;

  await db.insert(webhooks).values({
    tenantId: tenant.id,
    url: url.slice(0, 500),
    secret: `whsec_${randomBytes(24).toString("hex")}`,
    events,
    active: true,
  });
  revalidatePath("/app/settings/api");
}

export async function toggleWebhook(formData: FormData) {
  const { tenant } = await requireManager();
  const webhookId = String(formData.get("webhookId") ?? "");
  const [hook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.tenantId, tenant.id), eq(webhooks.id, webhookId)));
  if (!hook) return;

  if (hook.active) {
    await db.update(webhooks).set({ active: false }).where(eq(webhooks.id, hook.id));
  } else {
    // Re-enabling: we start from a clean state (failure counters reset to zero).
    await db
      .update(webhooks)
      .set({ active: true, disabledAt: null, failingSince: null })
      .where(eq(webhooks.id, hook.id));
  }
  revalidatePath("/app/settings/api");
}

export async function deleteWebhook(formData: FormData) {
  const { tenant } = await requireManager();
  const webhookId = String(formData.get("webhookId") ?? "");
  await db
    .delete(webhooks)
    .where(and(eq(webhooks.tenantId, tenant.id), eq(webhooks.id, webhookId)));
  revalidatePath("/app/settings/api");
}

/** Resending a delivery: HMAC-SHA256-signed POST, new delivery row. */
export async function resendDelivery(formData: FormData) {
  const { tenant } = await requireManager();
  const deliveryId = String(formData.get("deliveryId") ?? "");

  const [delivery] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.tenantId, tenant.id), eq(webhookDeliveries.id, deliveryId)));
  if (!delivery) return;
  const [hook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.tenantId, tenant.id), eq(webhooks.id, delivery.webhookId)));
  if (!hook) return;

  const body = JSON.stringify(delivery.payload ?? {});
  const signature = createHmac("sha256", hook.secret).update(body).digest("hex");

  const started = Date.now();
  let httpStatus: number | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ohd-event": delivery.event,
        "x-ohd-signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    httpStatus = res.status;
  } catch {
    httpStatus = null; // network failure / timeout
  }

  await db.insert(webhookDeliveries).values({
    tenantId: tenant.id,
    webhookId: hook.id,
    event: delivery.event,
    httpStatus,
    latencyMs: Date.now() - started,
    payload: delivery.payload,
  });

  revalidatePath("/app/settings/api");
}
