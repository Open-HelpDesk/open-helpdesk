import {
  automationRuns,
  contacts,
  db,
  ticketMessages,
  tickets,
} from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { sendTicketReplyEmail } from "@openhelpdesk/mail";
import { maybeSendCsat } from "./csat";
import type { RuleAction } from "./types";

type TicketRow = typeof tickets.$inferSelect;

function renderTemplate(template: string, ticket: TicketRow, contactName: string | null): string {
  return template
    .replaceAll("{{ticket.number}}", String(ticket.number))
    .replaceAll("{{ticket.subject}}", ticket.subject)
    .replaceAll("{{contact.name}}", contactName ?? "");
}

/**
 * Applique les actions d'une règle à un ticket, journalise dans automation_runs et
 * pose un événement système dans le fil (visible en AG-04). Retourne le ticket mis à jour.
 */
export async function applyActions(
  ticket: TicketRow,
  actions: RuleAction[],
  rule: { id: string; name: string },
): Promise<TicketRow> {
  const patch: Partial<typeof tickets.$inferInsert> = {};
  const applied: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case "set_status":
        patch.status = action.value;
        if (action.value === "resolved") patch.resolvedAt = new Date();
        if (action.value === "closed") patch.closedAt = new Date();
        applied.push(`statut → ${action.value}`);
        break;
      case "set_priority":
        patch.priority = action.value;
        applied.push(`priorité → ${action.value}`);
        break;
      case "assign_user":
        patch.assigneeId = action.value;
        applied.push("assigné");
        break;
      case "assign_team":
        patch.teamId = action.value;
        applied.push("équipe");
        break;
      case "add_tags":
        patch.tags = [...new Set([...ticket.tags, ...action.value])];
        applied.push(`tags + ${action.value.join(", ")}`);
        break;
      case "email_contact": {
        const [requester] = await db
          .select({ email: contacts.email, name: contacts.name })
          .from(contacts)
          .where(eq(contacts.id, ticket.requesterId));
        if (requester) {
          try {
            await sendTicketReplyEmail({
              tenantId: ticket.tenantId,
              ticketNumber: ticket.number,
              subject: ticket.subject,
              to: requester.email,
              bodyText: renderTemplate(action.value, ticket, requester.name),
            });
            applied.push(`email → ${requester.email}`);
          } catch (err) {
            console.error(`[rules] échec email_contact (règle ${rule.name}) :`, err);
          }
        }
        break;
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date();
    await db
      .update(tickets)
      .set(patch)
      .where(and(eq(tickets.tenantId, ticket.tenantId), eq(tickets.id, ticket.id)));
  }

  await db.insert(automationRuns).values({
    tenantId: ticket.tenantId,
    ruleId: rule.id,
    ticketId: ticket.id,
    actionsApplied: applied,
  });

  await db.insert(ticketMessages).values({
    tenantId: ticket.tenantId,
    ticketId: ticket.id,
    kind: "system_event",
    authorType: "system",
    bodyText: `Règle « ${rule.name} » : ${applied.join(" · ") || "aucune action"}`,
  });

  if (patch.status === "resolved") {
    await maybeSendCsat(ticket.tenantId, ticket.id);
  }

  return { ...ticket, ...patch } as TicketRow;
}
