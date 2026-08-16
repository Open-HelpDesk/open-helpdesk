"use server";

import { revalidatePath } from "next/cache";
import { contacts, db } from "@openhelpdesk/db";
import { and, eq, not } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

/** Bloquer / débloquer un contact (spam) — ses emails entrants seront rejetés. */
export async function toggleContactBlocked(formData: FormData) {
  const { tenant } = await requireAgent();
  const contactId = String(formData.get("contactId"));
  await db
    .update(contacts)
    .set({ blocked: not(contacts.blocked) })
    .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contactId)));
  revalidatePath(`/app/contacts/${contactId}`);
  revalidatePath("/app/contacts");
}
