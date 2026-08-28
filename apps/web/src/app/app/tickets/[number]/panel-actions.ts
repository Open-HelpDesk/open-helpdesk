"use server";

/**
 * AG-04 (V2) — what the side panels write: notes pinned to the contact, and
 * links between tickets.
 *
 * Both are internal. A pinned note is never shown to the customer, and a link is
 * a fact about our own work.
 */
import { and, eq } from "drizzle-orm";
import { contactNotes, db, ticketLinks, tickets } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function pinContactNote(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const number = Number(formData.get("number"));
  const contactId = String(formData.get("contactId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || !contactId) return;

  await db.insert(contactNotes).values({
    tenantId: tenant.id,
    contactId,
    authorId: agent.id,
    body,
  });
  // Every ticket of that contact shows the note, so the whole section is stale,
  // not just this page.
  revalidatePath(`/app/tickets/${number}`);
  revalidatePath("/app/contacts", "page");
}

export async function unpinContactNote(formData: FormData) {
  const { tenant } = await requireAgent();
  const number = Number(formData.get("number"));
  const id = String(formData.get("id") ?? "");
  await db
    .delete(contactNotes)
    .where(and(eq(contactNotes.tenantId, tenant.id), eq(contactNotes.id, id)));
  revalidatePath(`/app/tickets/${number}`);
}

export async function linkTicket(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const number = Number(formData.get("number"));
  const ticketId = String(formData.get("ticketId") ?? "");
  const target = Number(formData.get("target"));
  const relation = String(formData.get("relation") ?? "related");

  if (!Number.isInteger(target) || target === number) return;

  const [other] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.number, target)));
  if (!other) return;

  await db
    .insert(ticketLinks)
    .values({
      tenantId: tenant.id,
      ticketId,
      linkedTicketId: other.id,
      relation: (["related", "duplicate", "incident"] as const).includes(
        relation as "related" | "duplicate" | "incident",
      )
        ? (relation as "related" | "duplicate" | "incident")
        : "related",
      createdById: agent.id,
    })
    // Linking the same pair twice is a no-op, not an error: the unique index
    // says the fact is already recorded.
    .onConflictDoNothing();

  revalidatePath(`/app/tickets/${number}`);
  revalidatePath(`/app/tickets/${target}`);
}

export async function unlinkTicket(formData: FormData) {
  const { tenant } = await requireAgent();
  const number = Number(formData.get("number"));
  const id = String(formData.get("id") ?? "");
  // Stored one way round, read both ways — so removing it has to match either
  // direction, or a link made from the other ticket could not be undone here.
  await db
    .delete(ticketLinks)
    .where(and(eq(ticketLinks.tenantId, tenant.id), eq(ticketLinks.id, id)));
  revalidatePath(`/app/tickets/${number}`);
}
