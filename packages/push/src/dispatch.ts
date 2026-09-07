/**
 * Waking a phone for the four things that cannot wait for someone to look
 * (MO-xx): a ticket landed on you, the customer answered, an SLA target is
 * close, an SLA target is gone. Plus the customer's own one: an agent answered.
 *
 * Dispatched from the same funnels as the outbound webhooks — the rules engine's
 * `onContactMessage`, the SLA scanner, and wherever an assignee changes — so no
 * channel can be forgotten. Like webhooks, it NEVER throws: a notification is a
 * side effect of somebody else's action, and a dead gateway must not fail the
 * reply that triggered it.
 *
 * Fan-out is per device, not per person: an agent signed in on a phone and a
 * tablet expects both to buzz, and one dead token must not silence the other.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { contacts, db, pushDevices, ticketMessages, tickets, users } from "@openhelpdesk/db";
import { buildNotification, type PushEvent, type PushNotification } from "./payload";
import { sendPush, type PushPlatform } from "./senders";

export const PUSH_QUEUE = "push-dispatch";

export type PushJob = {
  tenantId: string;
  deviceId: string;
  platform: PushPlatform;
  token: string;
  notification: PushNotification;
};

/**
 * Send one notification and deal with what the gateway says about the token.
 *
 * A definitive rejection revokes the registration: the phone is gone, and the
 * row that points at it is now a way to keep failing forever.
 */
export async function deliverPushJob(job: PushJob): Promise<{ ok: boolean; gone: boolean }> {
  const result = await sendPush(job.platform, job.token, job.notification);
  if (!result.ok) {
    console.error(`[push] ${job.notification.event} to ${job.deviceId} failed: ${result.detail}`);
  }
  if (result.gone) {
    await db
      .update(pushDevices)
      .set({ revokedAt: new Date() })
      .where(and(eq(pushDevices.tenantId, job.tenantId), eq(pushDevices.id, job.deviceId)));
  } else if (result.ok) {
    await db
      .update(pushDevices)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(pushDevices.tenantId, job.tenantId), eq(pushDevices.id, job.deviceId)));
  }
  return { ok: result.ok, gone: result.gone };
}

async function enqueue(job: PushJob): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;
  try {
    const [{ Queue }, { default: IORedis }] = await Promise.all([
      import("bullmq"),
      import("ioredis"),
    ]);
    const connection = new IORedis(url, { maxRetriesPerRequest: null });
    const queue = new Queue(PUSH_QUEUE, { connection });
    await queue.add("send", job, {
      // Three tries over a couple of minutes. A notification that arrives ten
      // minutes late is worse than one that never arrives: the agent has
      // already opened the app and read the thing.
      attempts: 3,
      backoff: { type: "exponential", delay: 15_000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    });
    await queue.close();
    await connection.quit();
    return true;
  } catch (err) {
    console.error("[push] could not enqueue, sending inline:", err);
    return false;
  }
}

async function devicesForAgent(tenantId: string, userId: string) {
  return db
    .select({
      id: pushDevices.id,
      platform: pushDevices.platform,
      token: pushDevices.pushToken,
    })
    .from(pushDevices)
    .where(
      and(
        eq(pushDevices.tenantId, tenantId),
        eq(pushDevices.userId, userId),
        isNull(pushDevices.revokedAt),
      ),
    );
}

async function devicesForContact(tenantId: string, contactId: string) {
  return db
    .select({
      id: pushDevices.id,
      platform: pushDevices.platform,
      token: pushDevices.pushToken,
    })
    .from(pushDevices)
    .where(
      and(
        eq(pushDevices.tenantId, tenantId),
        eq(pushDevices.contactId, contactId),
        isNull(pushDevices.revokedAt),
      ),
    );
}

async function fanOut(
  tenantId: string,
  devices: { id: string; platform: PushPlatform; token: string }[],
  notification: PushNotification,
): Promise<number> {
  let sent = 0;
  for (const device of devices) {
    const job: PushJob = {
      tenantId,
      deviceId: device.id,
      platform: device.platform,
      token: device.token,
      notification,
    };
    if (!(await enqueue(job))) await deliverPushJob(job);
    sent++;
  }
  return sent;
}

/**
 * Notify the agent a ticket belongs to.
 *
 * `exceptUserId` is whoever caused the event: an agent who assigns a ticket to
 * themselves, or answers their own thread, does not need their phone to tell
 * them what they just did.
 */
export async function notifyAssignee(
  tenantId: string,
  ticketId: string,
  event: Exclude<PushEvent, "request.reply">,
  options: { actorName?: string | null; exceptUserId?: string | null } = {},
): Promise<number> {
  try {
    const [ticket] = await db
      .select({ number: tickets.number, assigneeId: tickets.assigneeId })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
    // An unassigned ticket has nobody to wake. A team queue would need a rule
    // about who to disturb, and the product has not taken that decision.
    if (!ticket?.assigneeId) return 0;
    if (options.exceptUserId && ticket.assigneeId === options.exceptUserId) return 0;

    const [agent] = await db
      .select({ available: users.available, status: users.status })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, ticket.assigneeId)));
    if (!agent || agent.status === "disabled") return 0;

    const devices = await devicesForAgent(tenantId, ticket.assigneeId);
    if (devices.length === 0) return 0;
    return fanOut(
      tenantId,
      devices,
      buildNotification(event, ticket.number, options.actorName ?? null),
    );
  } catch (err) {
    console.error(`[push] ${event} dispatch failed:`, err);
    return 0;
  }
}

/**
 * A message was added to a thread — tell whoever did not write it.
 *
 * The recipient is derived from the message itself rather than from the caller:
 * a customer's reply wakes the assignee, an agent's reply wakes the requester,
 * an internal note wakes nobody outside the workspace. Deriving it is what makes
 * this callable from every funnel without each one having to claim who wrote —
 * including the public API, where a public reply from an agent travels through
 * the same `onContactMessage` path an inbound email does.
 */
export async function notifyOnNewMessage(tenantId: string, ticketId: string): Promise<number> {
  try {
    const [last] = await db
      .select({
        authorType: ticketMessages.authorType,
        authorId: ticketMessages.authorId,
        kind: ticketMessages.kind,
      })
      .from(ticketMessages)
      .where(and(eq(ticketMessages.tenantId, tenantId), eq(ticketMessages.ticketId, ticketId)))
      .orderBy(desc(ticketMessages.createdAt))
      .limit(1);
    if (!last || last.kind !== "public_reply") return 0;

    if (last.authorType === "contact") {
      const name = last.authorId ? await contactName(tenantId, last.authorId) : null;
      return notifyAssignee(tenantId, ticketId, "ticket.reply", { actorName: name });
    }
    if (last.authorType === "agent") {
      const name = last.authorId ? await agentName(tenantId, last.authorId) : null;
      return notifyRequester(tenantId, ticketId, { actorName: name });
    }
    return 0;
  } catch (err) {
    console.error("[push] message dispatch failed:", err);
    return 0;
  }
}

async function contactName(tenantId: string, contactId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));
  return row?.name ?? row?.email ?? null;
}

async function agentName(tenantId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  return row?.name ?? null;
}

/** Notify the customer who opened a request that somebody answered (MC-04). */
export async function notifyRequester(
  tenantId: string,
  ticketId: string,
  options: { actorName?: string | null } = {},
): Promise<number> {
  try {
    const [ticket] = await db
      .select({ number: tickets.number, requesterId: tickets.requesterId })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));
    if (!ticket?.requesterId) return 0;

    const [contact] = await db
      .select({ blocked: contacts.blocked })
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, ticket.requesterId)));
    if (!contact || contact.blocked) return 0;

    const devices = await devicesForContact(tenantId, ticket.requesterId);
    if (devices.length === 0) return 0;
    return fanOut(
      tenantId,
      devices,
      buildNotification("request.reply", ticket.number, options.actorName ?? null),
    );
  } catch (err) {
    console.error("[push] request.reply dispatch failed:", err);
    return 0;
  }
}
