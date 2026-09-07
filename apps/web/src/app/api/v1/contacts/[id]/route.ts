/**
 * /api/v1/contacts/{id} — read, update, delete.
 *
 * Deleting a contact is the GDPR erasure gesture, and it is destructive on
 * purpose: their tickets go with them. An integration that only wants to stop
 * someone writing in should set `blocked` instead.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { contacts, db, tickets } from "@openhelpdesk/db";
import { apiError, apiJson, readJson, serializeContact, withApi } from "@/lib/api";

async function load(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, id)));
  return row ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { id } = await params;
    const contact = await load(tenant.id, id);
    if (!contact) return apiError(404, "not_found", "No contact with that id.");
    return apiJson(serializeContact(contact));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const contact = await load(tenant.id, id);
    if (!contact) return apiError(404, "not_found", "No contact with that id.");

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const patch: Partial<typeof contacts.$inferInsert> = {};
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email.includes("@")) return apiError(400, "invalid_email", "email must be a valid address.");
      if (email !== contact.email) {
        // The address is the unique key of a contact: a clash would be a
        // constraint violation, and a 409 says what happened far better.
        const [clash] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.email, email)));
        if (clash) return apiError(409, "email_taken", "Another contact already uses that address.");
      }
      patch.email = email;
    }
    if (body.name !== undefined) patch.name = body.name === null ? null : String(body.name).slice(0, 200);
    if (body.phone !== undefined) patch.phone = body.phone === null ? null : String(body.phone).slice(0, 40);
    if (body.locale !== undefined) patch.locale = body.locale === null ? null : String(body.locale).slice(0, 10);
    if (body.blocked !== undefined) patch.blocked = body.blocked === true;
    if (
      body.custom_fields !== undefined &&
      typeof body.custom_fields === "object" &&
      body.custom_fields !== null &&
      !Array.isArray(body.custom_fields)
    ) {
      patch.customFields = {
        ...(contact.customFields as Record<string, unknown>),
        ...(body.custom_fields as Record<string, unknown>),
      };
    }
    if (Object.keys(patch).length === 0) return apiJson(serializeContact(contact));

    const [updated] = await db
      .update(contacts)
      .set(patch)
      .where(eq(contacts.id, contact.id))
      .returning();
    return apiJson(serializeContact(updated!));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const contact = await load(tenant.id, id);
    if (!contact) return apiError(404, "not_found", "No contact with that id.");

    /*
     * Refused while the person still has tickets, unless the caller says so.
     *
     * `tickets.requester_id` is NOT NULL: the rows cannot simply be detached,
     * they would have to be deleted with the contact. Doing that silently on a
     * DELETE would erase a support history because someone tidied a CRM. The
     * caller has to ask for it, and then it is their decision, recorded as one.
     */
    const owned = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.requesterId, contact.id)))
      .limit(1);
    const withTickets = new URL(request.url).searchParams.get("delete_tickets") === "true";
    if (owned.length > 0 && !withTickets) {
      return apiError(
        409,
        "contact_has_tickets",
        "This contact has tickets. Re-send with ?delete_tickets=true to erase them too, or set blocked instead.",
      );
    }

    await db.transaction(async (tx) => {
      if (owned.length > 0) {
        await tx
          .delete(tickets)
          .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.requesterId, contact.id)));
      }
      await tx.delete(contacts).where(eq(contacts.id, contact.id));
    });
    return new Response(null, { status: 204 });
  });
}
