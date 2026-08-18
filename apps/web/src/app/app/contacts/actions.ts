"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  contactOrganizations,
  contacts,
  db,
  tickets,
  ticketMessages,
} from "@openhelpdesk/db";
import { and, count, eq, not } from "drizzle-orm";
import { requireAgent } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Bloquer / débloquer un contact (spam) — ses emails entrants seront rejetés. */
export async function toggleContactBlocked(formData: FormData) {
  const { tenant } = await requireAgent();
  const contactId = String(formData.get("contactId"));
  await db
    .update(contacts)
    .set({ blocked: not(contacts.blocked) })
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  revalidatePath("/app/contacts");
}

/** « + Contact » (AG-07) — création manuelle simple. */
export async function createContact(formData: FormData) {
  const { tenant } = await requireAgent();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!email || !email.includes("@")) return;

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));
  if (existing) {
    redirect(`/app/contacts?selected=${existing.id}`);
  }

  const [created] = await db
    .insert(contacts)
    .values({ tenantId: tenant.id, email, name: name || null })
    .returning();

  revalidatePath("/app/contacts");
  redirect(`/app/contacts?selected=${created!.id}`);
}

/**
 * « Fusionner deux contacts » (AG-07) : les tickets et rattachements du contact
 * source sont réassignés au contact conservé, puis la fiche source est supprimée.
 */
export async function mergeContacts(formData: FormData) {
  const { tenant } = await requireAgent();
  const keepId = String(formData.get("keepId"));
  const sourceId = String(formData.get("sourceId"));
  if (!keepId || !sourceId || keepId === sourceId) return;

  const [keep] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, keepId)));
  const [source] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, sourceId)));
  if (!keep || !source) return;

  // Tickets et messages du contact source → contact conservé.
  await db
    .update(tickets)
    .set({ requesterId: keep.id })
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.requesterId, source.id)));
  await db
    .update(ticketMessages)
    .set({ authorId: keep.id })
    .where(
      and(
        eq(ticketMessages.tenantId, tenant.id),
        eq(ticketMessages.authorType, "contact"),
        eq(ticketMessages.authorId, source.id),
      ),
    );
  // Rattachements d'organisation (doublons ignorés puis liens source purgés).
  const links = await db
    .select()
    .from(contactOrganizations)
    .where(eq(contactOrganizations.contactId, source.id));
  for (const link of links) {
    await db
      .insert(contactOrganizations)
      .values({ tenantId: tenant.id, contactId: keep.id, organizationId: link.organizationId })
      .onConflictDoNothing();
  }
  await db.delete(contactOrganizations).where(eq(contactOrganizations.contactId, source.id));
  await db
    .delete(contacts)
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, source.id)));

  revalidatePath("/app/contacts");
  redirect(`/app/contacts?selected=${keep.id}`);
}

/**
 * « Supprimer (RGPD) » (AG-07) : anonymise email/nom/téléphone ; la fiche est
 * supprimée définitivement si aucun ticket ne la référence.
 */
export async function deleteContactRgpd(formData: FormData) {
  const { tenant } = await requireAgent();
  const contactId = String(formData.get("contactId"));
  if (!contactId) return;

  const [ticketCount] = await db
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.requesterId, contactId)));

  if ((ticketCount?.n ?? 0) === 0) {
    await db.delete(contactOrganizations).where(eq(contactOrganizations.contactId, contactId));
    await db
      .delete(contacts)
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  } else {
    const t = await getT();
    await db
      .update(contacts)
      .set({
        name: t("app.contacts.deletedName"),
        email: `rgpd-${contactId}@anonyme.invalid`,
        phone: null,
        blocked: true,
        customFields: {},
      })
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  }

  revalidatePath("/app/contacts");
  redirect("/app/contacts");
}
