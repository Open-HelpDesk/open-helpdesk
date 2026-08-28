/**
 * CSAT (ST-08): survey sent to the requester when the ticket is resolved, only
 * once per ticket (csat_sent_at). HMAC-signed links — no state on the client side.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { contacts, db, tenants, tickets } from "@openhelpdesk/db";
import { and, eq, isNull } from "drizzle-orm";
import { sendTenantEmail } from "@openhelpdesk/mail";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me";
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost:3000";
const PROTOCOL = BASE_DOMAIN.includes("localhost") ? "http" : "https";

export function csatSignature(ticketId: string, score: string): string {
  return createHmac("sha256", SECRET).update(`csat:${ticketId}:${score}`).digest("hex").slice(0, 32);
}

export function verifyCsatSignature(ticketId: string, score: string, sig: string): boolean {
  const expected = csatSignature(ticketId, score);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export type CsatConfig = { enabled?: boolean; question?: string };

/** Sends the survey if it is enabled and has not already gone out for this ticket. */
export async function maybeSendCsat(tenantId: string, ticketId: string): Promise<boolean> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId), isNull(tickets.csatSentAt)));
  if (!ticket || ticket.status !== "resolved") return false;
  /*
   * The agent can turn the survey off for this ticket from the Resolution tab
   * (V2). Checked here rather than at each caller: three call sites resolve a
   * ticket, and a switch honoured by two of them is a switch that cannot be
   * trusted.
   */
  if (!ticket.resolutionSendCsat) return false;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const config = (tenant?.csatConfig ?? {}) as CsatConfig;
  if (!tenant || !config.enabled) return false;

  const [requester] = await db.select().from(contacts).where(eq(contacts.id, ticket.requesterId));
  if (!requester) return false;

  const base = `${PROTOCOL}://${tenant.slug}.${BASE_DOMAIN}/api/csat`;
  const link = (score: "good" | "bad") =>
    `${base}?t=${ticket.id}&s=${score}&sig=${csatSignature(ticket.id, score)}`;
  // System emails sent from the rules engine cannot reach the dictionaries:
  // this package has neither the request context nor the app's i18n. The
  // wording therefore stays in the source language, and the question is the
  // tenant's own as soon as ST-08 is configured. Localising these emails means
  // moving their templating to a layer that knows the tenant locale.
  const question = config.question ?? "How would you rate the answer to your request?";

  try {
    await sendTenantEmail({
      tenantId,
      to: requester.email,
      kind: "csat",
      ticketId: ticket.id,
      subject: `Your feedback on request #${ticket.number}`,
      text:
        `Hello${requester.name ? ` ${requester.name}` : ""},\n\n` +
        `Your request "${ticket.subject}" (#${ticket.number}) has been resolved.\n\n` +
        `${question}\n\n` +
        `Good answer: ${link("good")}\n` +
        `Poor answer: ${link("bad")}\n\n` +
        `${tenant.name}`,
    });
  } catch (err) {
    console.error("[csat] send failed:", err);
    return false;
  }

  await db.update(tickets).set({ csatSentAt: new Date() }).where(eq(tickets.id, ticket.id));
  return true;
}
