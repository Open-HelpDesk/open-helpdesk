"use server";

/**
 * AG-04 (V2) — the ticket's checklist.
 *
 * Tasks are internal: the customer never sees them. Every change writes a line
 * into the Activity tab, because a checklist nobody can audit is a checklist
 * that quietly loses items.
 */
import { and, eq } from "drizzle-orm";
import { db, ticketMessages, ticketTasks, tickets, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";
import { revalidatePath } from "next/cache";

/** Loads the ticket by number inside the tenant, or null. */
async function ticketOf(tenantId: string, number: number) {
  const [row] = await db
    .select({ id: tickets.id, number: tickets.number })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenantId), eq(tickets.number, number)));
  return row ?? null;
}

/** One activity line per change, attributed to the agent who made it. */
async function trace(tenantId: string, ticketId: string, text: string) {
  await db.insert(ticketMessages).values({
    tenantId,
    ticketId,
    kind: "system_event",
    authorType: "system",
    bodyText: text,
  });
}

export async function addTicketTask(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const number = Number(formData.get("number"));
  const label = String(formData.get("label") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "");
  const due = String(formData.get("due") ?? "").trim();

  const ticket = await ticketOf(tenant.id, number);
  // An empty label is not an error to report: the button that sends it is
  // disabled until there is one, and a blank task says nothing to anybody.
  if (!ticket || !label) return;

  /*
   * A due date arrives as a date input's YYYY-MM-DD, which has no time. Ending
   * the day rather than starting it is what an agent means by "due Friday":
   * midnight would make Friday's task overdue for the whole of Friday.
   */
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:59`) : null;

  // Only a real member of this workspace can be given the task.
  let assigneeId: string | null = null;
  if (assignee && assignee !== "none") {
    const [member] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.id, assignee)));
    assigneeId = member?.id ?? null;
  }

  await db.insert(ticketTasks).values({
    tenantId: tenant.id,
    ticketId: ticket.id,
    label,
    assigneeId,
    dueAt,
    createdById: agent.id,
  });
  await trace(tenant.id, ticket.id, t("app.ticket.taskTraceAdded", { label, who: agent.name }));
  revalidatePath(`/app/tickets/${number}`);
}

export async function toggleTicketTask(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const number = Number(formData.get("number"));
  const id = String(formData.get("id") ?? "");

  const ticket = await ticketOf(tenant.id, number);
  if (!ticket) return;

  const [task] = await db
    .select()
    .from(ticketTasks)
    .where(
      and(
        eq(ticketTasks.tenantId, tenant.id),
        eq(ticketTasks.id, id),
        eq(ticketTasks.ticketId, ticket.id),
      ),
    );
  if (!task) return;

  const done = !task.done;
  await db
    .update(ticketTasks)
    .set({ done, doneAt: done ? new Date() : null })
    .where(and(eq(ticketTasks.tenantId, tenant.id), eq(ticketTasks.id, id)));
  await trace(
    tenant.id,
    ticket.id,
    t(done ? "app.ticket.taskTraceDone" : "app.ticket.taskTraceReopened", {
      label: task.label,
      who: agent.name,
    }),
  );
  revalidatePath(`/app/tickets/${number}`);
}

export async function deleteTicketTask(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const t = await getT();
  const number = Number(formData.get("number"));
  const id = String(formData.get("id") ?? "");

  const ticket = await ticketOf(tenant.id, number);
  if (!ticket) return;

  const [task] = await db
    .select({ label: ticketTasks.label })
    .from(ticketTasks)
    .where(
      and(
        eq(ticketTasks.tenantId, tenant.id),
        eq(ticketTasks.id, id),
        eq(ticketTasks.ticketId, ticket.id),
      ),
    );
  if (!task) return;

  await db
    .delete(ticketTasks)
    .where(and(eq(ticketTasks.tenantId, tenant.id), eq(ticketTasks.id, id)));
  await trace(
    tenant.id,
    ticket.id,
    t("app.ticket.taskTraceDeleted", { label: task.label, who: agent.name }),
  );
  revalidatePath(`/app/tickets/${number}`);
}
