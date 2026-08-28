"use server";

/**
 * AG-04 (V2) — resolving a ticket from the Resolution tab.
 *
 * The tab records why it happened, what to read next time, and what we told the
 * customer. That last one is labelled "visible to the customer" in the design, so
 * it is sent: a customer-visible summary the customer never receives would be a
 * label that lies.
 *
 * Sending goes through `sendReply` rather than a second copy of it. That action
 * already inserts the message, delivers the mail, moves the SLA clock, applies
 * the status change with its timestamps, fires the webhooks and revalidates —
 * duplicating any of that here would be a path free to drift from the one an
 * ordinary reply takes.
 */
import { and, eq } from "drizzle-orm";
import { db, kbArticles, ticketMessages, tickets } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { revalidatePath } from "next/cache";
import { sendReply, updateTicketProps } from "../actions";

const CAUSES = [
  "product_bug",
  "configuration",
  "user_error",
  "third_party",
  "duplicate",
  "no_fault_found",
] as const;

export async function resolveTicket(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const number = Number(formData.get("number"));
  const ticketId = String(formData.get("ticketId") ?? "");
  const cause = String(formData.get("cause") ?? "");
  const articleId = String(formData.get("articleId") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  /*
   * Absent is not "no". The checkbox is only rendered when the workspace has
   * surveys on, so reading a missing field as false would record a refusal
   * nobody expressed — and it would stick if surveys were switched on later.
   */
  const csatAnswered = formData.has("sendCsat") || formData.get("csatShown") === "1";
  const sendCsat = formData.get("sendCsat") === "on";

  const [ticket] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticketId)));
  if (!ticket) return;

  // The article has to be one of ours: a stranger's id would put someone else's
  // knowledge base on our resolution.
  let article: string | null = null;
  if (articleId) {
    const [row] = await db
      .select({ id: kbArticles.id })
      .from(kbArticles)
      .where(and(eq(kbArticles.tenantId, tenant.id), eq(kbArticles.id, articleId)));
    article = row?.id ?? null;
  }

  /*
   * Written before the status changes, because resolving is what triggers the
   * survey and maybeSendCsat reads this row: set afterwards, the "do not send"
   * choice would arrive too late to be honoured.
   */
  await db
    .update(tickets)
    .set({
      resolutionCause: (CAUSES as readonly string[]).includes(cause)
        ? (cause as (typeof CAUSES)[number])
        : null,
      resolutionArticleId: article,
      resolutionSummary: summary || null,
      ...(csatAnswered ? { resolutionSendCsat: sendCsat } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.id, ticket.id)));

  if (summary) {
    const reply = new FormData();
    reply.set("ticketId", ticket.id);
    reply.set("kind", "public_reply");
    reply.set("body", summary);
    reply.set("nextStatus", "resolved");
    await sendReply(reply);
  } else {
    const status = new FormData();
    status.set("ticketId", ticket.id);
    status.set("number", String(number));
    status.set("status", "resolved");
    await updateTicketProps(status);
  }

  await db.insert(ticketMessages).values({
    tenantId: tenant.id,
    ticketId: ticket.id,
    kind: "system_event",
    authorType: "system",
    bodyText: t("app.ticket.resolutionTrace", { who: agent.name }),
  });

  revalidatePath(`/app/tickets/${number}`);
}
