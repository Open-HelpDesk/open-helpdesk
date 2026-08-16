"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  contactOrganizations,
  contacts,
  db,
  organizations,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, arrayContains, eq } from "drizzle-orm";
import { sendTicketReplyEmail } from "@openhelpdesk/mail";
import { onAgentReplySla, onTicketCreated, runTriggers } from "@openhelpdesk/rules";
import { requireAgent } from "@/lib/session";
import { nextTicketNumber } from "@/lib/data";

const OPENING_STATUS = new Set(["new", "open", "waiting", "on_hold"]);

/** Répondre / noter en interne, avec bascule de statut optionnelle (AG-04, bouton scindé). */
export async function sendReply(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const ticketId = String(formData.get("ticketId"));
  const kind = formData.get("kind") === "internal_note" ? "internal_note" : "public_reply";
  const body = String(formData.get("body") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "");
  if (!body) return;

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));
  if (!ticket || ticket.mergedIntoId) return;

  const [message] = await db
    .insert(ticketMessages)
    .values({
      tenantId: tenant.id,
      ticketId,
      kind,
      authorType: "agent",
      authorId: agent.id,
      bodyText: body,
    })
    .returning();

  // Réponse publique → email au demandeur (transport console en dev, Resend en cloud).
  if (kind === "public_reply" && message) {
    try {
      const [requester] = await db
        .select({ email: contacts.email })
        .from(contacts)
        .where(eq(contacts.id, ticket.requesterId));
      if (requester) {
        const sent = await sendTicketReplyEmail({
          tenantId: tenant.id,
          ticketNumber: ticket.number,
          subject: ticket.subject,
          to: requester.email,
          bodyText: body,
        });
        if (sent?.messageId) {
          await db
            .update(ticketMessages)
            .set({ emailMeta: { messageId: sent.messageId } })
            .where(eq(ticketMessages.id, message.id));
        }
      }
    } catch (err) {
      // L'échec d'envoi ne bloque pas la réponse — il sera visible dans le journal (ST-03).
      console.error("[mail] échec d'envoi de la réponse :", err);
    }
  }

  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  if (kind === "public_reply") {
    if (!ticket.firstRepliedAt) patch.firstRepliedAt = new Date();
    await onAgentReplySla(tenant.id, ticketId);
  }
  if (nextStatus && OPENING_STATUS.has(nextStatus)) {
    patch.status = nextStatus as typeof ticket.status;
  } else if (nextStatus === "resolved") {
    patch.status = "resolved";
    patch.resolvedAt = new Date();
  }
  await db
    .update(tickets)
    .set(patch)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));

  revalidatePath(`/app/tickets/${ticket.number}`);
  revalidatePath("/app/tickets");
}

/** Panneau propriétés (AG-04) : assigné, priorité, statut. */
export async function updateTicketProps(formData: FormData) {
  const { tenant } = await requireAgent();
  const ticketId = String(formData.get("ticketId"));
  const number = Number(formData.get("number"));

  const assigneeId = String(formData.get("assigneeId") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const status = String(formData.get("status") ?? "");

  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  patch.assigneeId = assigneeId === "" ? null : assigneeId;
  if (["low", "normal", "high", "urgent"].includes(priority)) {
    patch.priority = priority as "low" | "normal" | "high" | "urgent";
  }
  if (["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(status)) {
    patch.status = status as typeof tickets.$inferInsert.status;
    if (status === "resolved") patch.resolvedAt = new Date();
    if (status === "closed") patch.closedAt = new Date();
  }

  await db
    .update(tickets)
    .set(patch)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));

  await runTriggers("ticket.updated", tenant.id, ticketId);

  revalidatePath(`/app/tickets/${number}`);
  revalidatePath("/app/tickets");
}

/**
 * AG-05 — Nouveau ticket au nom d'un client. Contact trouvé ou créé à la volée ;
 * rattachement automatique à l'organisation par domaine email (AG-08).
 */
export async function createTicket(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal") as
    | "low"
    | "normal"
    | "high"
    | "urgent";

  if (!email || !subject) return;

  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));

  const domain = email.split("@")[1] ?? "";
  const [orgByDomain] = domain
    ? await db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.tenantId, tenant.id),
            arrayContains(organizations.emailDomains, [domain]),
          ),
        )
    : [];

  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ tenantId: tenant.id, email, name: name || null })
      .returning();
    if (contact && orgByDomain) {
      await db.insert(contactOrganizations).values({
        tenantId: tenant.id,
        contactId: contact.id,
        organizationId: orgByDomain.id,
      });
    }
  }

  const number = await nextTicketNumber(tenant.id);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number,
      subject,
      status: "open",
      priority,
      channel: "api",
      requesterId: contact!.id,
      organizationId: orgByDomain?.id ?? null,
      assigneeId: agent.id,
    })
    .returning();

  if (body) {
    await db.insert(ticketMessages).values({
      tenantId: tenant.id,
      ticketId: ticket!.id,
      kind: "public_reply",
      authorType: "agent",
      authorId: agent.id,
      bodyText: body,
    });
  }

  await onTicketCreated(tenant.id, ticket!.id);

  revalidatePath("/app/tickets");
  redirect(`/app/tickets/${number}`);
}
