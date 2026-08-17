/**
 * CSAT (ST-08) : enquête envoyée au demandeur à la résolution du ticket, une seule
 * fois par ticket (csat_sent_at). Liens signés HMAC — aucun état côté client.
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

/** Envoie l'enquête si elle est activée et pas déjà partie pour ce ticket. */
export async function maybeSendCsat(tenantId: string, ticketId: string): Promise<boolean> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId), isNull(tickets.csatSentAt)));
  if (!ticket || ticket.status !== "resolved") return false;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const config = (tenant?.csatConfig ?? {}) as CsatConfig;
  if (!tenant || !config.enabled) return false;

  const [requester] = await db.select().from(contacts).where(eq(contacts.id, ticket.requesterId));
  if (!requester) return false;

  const base = `${PROTOCOL}://${tenant.slug}.${BASE_DOMAIN}/api/csat`;
  const link = (score: "good" | "bad") =>
    `${base}?t=${ticket.id}&s=${score}&sig=${csatSignature(ticket.id, score)}`;
  const question =
    config.question ?? "Comment évaluez-vous la réponse apportée à votre demande ?";

  try {
    await sendTenantEmail({
      tenantId,
      to: requester.email,
      kind: "csat",
      ticketId: ticket.id,
      subject: `Votre avis sur la demande #${ticket.number}`,
      text:
        `Bonjour${requester.name ? ` ${requester.name}` : ""},\n\n` +
        `Votre demande « ${ticket.subject} » (#${ticket.number}) a été résolue.\n\n` +
        `${question}\n\n` +
        `Bonne réponse : ${link("good")}\n` +
        `Mauvaise réponse : ${link("bad")}\n\n` +
        `${tenant.name}`,
    });
  } catch (err) {
    console.error("[csat] échec d'envoi :", err);
    return false;
  }

  await db.update(tickets).set({ csatSentAt: new Date() }).where(eq(tickets.id, ticket.id));
  return true;
}
