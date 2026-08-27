/**
 * /api/v1/contacts/{id} — read one contact by its id.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { contacts, db } from "@openhelpdesk/db";
import { apiError, apiJson, serializeContact, withApi } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { id } = await params;
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, id)));
    if (!contact) return apiError(404, "not_found", "No contact with that id.");
    return apiJson(serializeContact(contact));
  });
}
