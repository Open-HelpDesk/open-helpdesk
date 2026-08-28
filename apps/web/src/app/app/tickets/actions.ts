"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dispatchTicketChanged, dispatchWebhookEvent } from "@openhelpdesk/webhooks";
import {
  contactOrganizations,
  contacts,
  db,
  organizations,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, arrayContains, eq, inArray, sql } from "drizzle-orm";
import { sendTicketReplyEmail } from "@openhelpdesk/mail";
import { maybeSendCsat, onAgentReplySla, onTicketCreated, runTriggers } from "@openhelpdesk/rules";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { nextTicketNumber } from "@/lib/data";
import { saveUploadedFiles } from "@/lib/storage";

const OPENING_STATUS = new Set(["new", "open", "waiting", "on_hold"]);

/** Reply / write an internal note, with an optional status switch (AG-04, split button). */
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

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length > 0 && message) {
    await saveUploadedFiles(tenant.id, message.id, files);
  }

  // Public reply → email to the requester (console transport in dev, Resend in cloud).
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
      // A send failure does not block the reply — it will show up in the log (ST-03).
      console.error("[mail] failed to send the reply:", err);
    }
  }

  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  if (kind === "public_reply") {
    if (!ticket.firstRepliedAt) patch.firstRepliedAt = new Date();
    await onAgentReplySla(tenant.id, ticketId);
  }

  // Server actions of the applied macro (priority, team, tags — ST-06).
  const macroId = String(formData.get("macroId") ?? "");
  if (macroId) {
    const { macros } = await import("@openhelpdesk/db");
    const [macro] = await db
      .select()
      .from(macros)
      .where(and(eq(macros.tenantId, tenant.id), eq(macros.id, macroId)));
    for (const action of (macro?.actions as { type: string; value?: unknown }[]) ?? []) {
      if (action.type === "set_priority" && typeof action.value === "string") {
        patch.priority = action.value as typeof ticket.priority;
      } else if (action.type === "assign_team" && typeof action.value === "string") {
        patch.teamId = action.value;
      } else if (action.type === "assign_user" && typeof action.value === "string") {
        patch.assigneeId = action.value;
      } else if (action.type === "add_tags" && Array.isArray(action.value)) {
        patch.tags = [...new Set([...ticket.tags, ...(action.value as string[])])];
      }
    }
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

  if (patch.status === "resolved") {
    await maybeSendCsat(tenant.id, ticketId);
  }

  // An agent's reply or note is a message event too — the customer channels go
  // through onContactMessage, this is the other side of the same conversation.
  await dispatchWebhookEvent(tenant.id, "message.created", ticketId);
  if (patch.status) {
    await dispatchTicketChanged(tenant.id, ticketId, ticket.status, patch.status);
  }

  revalidatePath(`/app/tickets/${ticket.number}`);
  revalidatePath("/app/tickets");
}

/** Properties panel (AG-04): assignee, team, priority, type, status. */
export async function updateTicketProps(formData: FormData) {
  const { tenant } = await requireAgent();
  const ticketId = String(formData.get("ticketId"));
  const number = Number(formData.get("number"));

  const priority = String(formData.get("priority") ?? "");
  const status = String(formData.get("status") ?? "");

  const patch: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
  if (formData.has("assigneeId")) {
    const assigneeId = String(formData.get("assigneeId") ?? "");
    patch.assigneeId = assigneeId === "" ? null : assigneeId;
  }
  if (formData.has("teamId")) {
    const teamId = String(formData.get("teamId") ?? "");
    patch.teamId = teamId === "" ? null : teamId;
  }
  if (formData.has("type")) {
    const type = String(formData.get("type") ?? "");
    patch.type = type === "" ? null : type;
  }
  if (["low", "normal", "high", "urgent"].includes(priority)) {
    patch.priority = priority as "low" | "normal" | "high" | "urgent";
  }
  if (["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(status)) {
    patch.status = status as typeof tickets.$inferInsert.status;
    if (status === "resolved") patch.resolvedAt = new Date();
    if (status === "closed") patch.closedAt = new Date();
    /*
     * Reopening clears the instants that said it was finished. Without this the
     * SLA timeline showed "ticket resolved" on a ticket that was open again, and
     * "resolved on <date>" on the Resolution tab — a record of something that had
     * been undone, presented as current.
     */
    if (["new", "open", "waiting", "on_hold"].includes(status)) {
      patch.resolvedAt = null;
      patch.closedAt = null;
    }
  }

  // Read the status before writing: ticket.solved must fire on the transition,
  // not every time a resolved ticket is touched again.
  const [before] = await db
    .select({ status: tickets.status })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));

  await db
    .update(tickets)
    .set(patch)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));

  if (patch.status === "resolved") {
    await maybeSendCsat(tenant.id, ticketId);
  }

  await runTriggers("ticket.updated", tenant.id, ticketId);
  await dispatchTicketChanged(
    tenant.id,
    ticketId,
    before?.status ?? null,
    patch.status ?? before?.status ?? null,
  );

  revalidatePath(`/app/tickets/${number}`);
  revalidatePath("/app/tickets");
}

/* ---------- AG-03 — Bulk actions (floating bar) ---------- */

export type BulkOp = "assign" | "status" | "priority" | "tag" | "delete";

/** Multi-selection bar: Assign / Status / Priority / Tag / Delete. */
export async function bulkUpdateTickets(input: {
  ids: string[];
  op: BulkOp;
  value?: string;
}) {
  const { tenant } = await requireAgent();
  const ids = input.ids.filter(Boolean);
  if (ids.length === 0) return;

  const scope = and(eq(tickets.tenantId, tenant.id), inArray(tickets.id, ids));
  const value = input.value ?? "";

  switch (input.op) {
    case "assign":
      await db
        .update(tickets)
        .set({ assigneeId: value === "" ? null : value, updatedAt: new Date() })
        .where(scope);
      break;
    case "status":
      if (["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(value)) {
        // Statuses read before the write: a bulk pass can hold tickets that were
        // already resolved, and those must not re-emit ticket.solved.
        const previous = await db
          .select({ id: tickets.id, status: tickets.status })
          .from(tickets)
          .where(scope);
        await db
          .update(tickets)
          .set({
            status: value as typeof tickets.$inferInsert.status,
            ...(value === "resolved" ? { resolvedAt: new Date() } : {}),
            ...(value === "closed" ? { closedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(scope);
        for (const row of previous) {
          await dispatchTicketChanged(tenant.id, row.id, row.status, value);
        }
      }
      break;
    case "priority":
      if (["low", "normal", "high", "urgent"].includes(value)) {
        await db
          .update(tickets)
          .set({ priority: value as "low" | "normal" | "high" | "urgent", updatedAt: new Date() })
          .where(scope);
      }
      break;
    case "tag": {
      const tag = value.trim().toLowerCase();
      if (tag) {
        await db
          .update(tickets)
          .set({
            tags: sql`(select array_agg(distinct t) from unnest(${tickets.tags} || ${sql`array[${tag}]::text[]`}) as t)`,
            updatedAt: new Date(),
          })
          .where(scope);
      }
      break;
    }
    case "delete":
      await db.update(tickets).set({ deletedAt: new Date() }).where(scope);
      break;
  }

  revalidatePath("/app/tickets");
}

/* ---------- AG-04 — Ticket merge ---------- */

/** Merge this ticket into a target ticket: mergedIntoId + system messages + redirect. */
export async function mergeTicket(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const ticketId = String(formData.get("ticketId"));
  const targetNumber = Number(String(formData.get("targetNumber") ?? "").replace(/^#/, ""));
  if (!Number.isInteger(targetNumber) || targetNumber <= 0) return;

  const [source] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));
  if (!source || source.mergedIntoId) return;

  const [target] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, targetNumber)));
  if (!target || target.id === source.id || target.mergedIntoId) return;

  await db
    .update(tickets)
    .set({ mergedIntoId: target.id, status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, source.id)));

  await db.insert(ticketMessages).values([
    {
      tenantId: tenant.id,
      ticketId: source.id,
      kind: "system_event" as const,
      authorType: "system" as const,
      bodyText: t("app.tickets.mergedIntoMessage", {
        number: String(target.number),
        agent: agent.name,
      }),
    },
    {
      tenantId: tenant.id,
      ticketId: target.id,
      kind: "system_event" as const,
      authorType: "system" as const,
      bodyText: t("app.tickets.mergedFromMessage", {
        number: String(source.number),
        agent: agent.name,
      }),
    },
  ]);

  revalidatePath(`/app/tickets/${source.number}`);
  revalidatePath(`/app/tickets/${target.number}`);
  revalidatePath("/app/tickets");
  redirect(`/app/tickets/${target.number}`);
}

/**
 * AG-05 — New ticket on behalf of a customer. Contact found or created on the fly;
 * automatic attachment to the organization by email domain (AG-08).
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

  // AG-05 options ("New ticket" card) — backward-compatible.
  const statusInput = String(formData.get("status") ?? "");
  const status = (
    ["new", "open", "waiting", "on_hold"].includes(statusInput) ? statusInput : "open"
  ) as "new" | "open" | "waiting" | "on_hold";
  const assigneeInput = String(formData.get("assigneeId") ?? "me");
  const assigneeId =
    assigneeInput === "me" ? agent.id : assigneeInput === "" ? null : assigneeInput;
  const formIdInput = String(formData.get("formId") ?? "");
  const tag = String(formData.get("tag") ?? "").trim().toLowerCase();
  const sendEmail = formData.get("sendEmail") === "on";

  const number = await nextTicketNumber(tenant.id);
  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: tenant.id,
      number,
      subject,
      status,
      priority,
      channel: "api",
      requesterId: contact!.id,
      organizationId: orgByDomain?.id ?? null,
      assigneeId,
      formId: formIdInput || null,
      tags: tag ? [tag] : [],
    })
    .returning();

  if (body) {
    const [message] = await db
      .insert(ticketMessages)
      .values({
        tenantId: tenant.id,
        ticketId: ticket!.id,
        kind: "public_reply",
        authorType: "agent",
        authorId: agent.id,
        bodyText: body,
      })
      .returning();

    // "Send the reply by email to the contact" (AG-05 callout).
    if (sendEmail && message) {
      try {
        const sent = await sendTicketReplyEmail({
          tenantId: tenant.id,
          ticketNumber: number,
          subject,
          to: email,
          bodyText: body,
        });
        if (sent?.messageId) {
          await db
            .update(ticketMessages)
            .set({ emailMeta: { messageId: sent.messageId } })
            .where(eq(ticketMessages.id, message.id));
        }
      } catch (err) {
        console.error("[mail] failed to send on ticket creation:", err);
      }
    }
  }

  await onTicketCreated(tenant.id, ticket!.id);

  revalidatePath("/app/tickets");
  redirect(`/app/tickets/${number}`);
}
