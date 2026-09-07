/**
 * /api/v1/organizations/{id} — read, update, delete.
 *
 * Deleting detaches the company from its tickets and contacts rather than
 * taking them with it: a customer's history must survive the disappearance of
 * the company record it happened to be filed under.
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, organizations, tickets } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  readJson,
  readDomains,
  serializeOrganization,
  withApi,
} from "@/lib/api";

async function load(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.tenantId, tenantId), eq(organizations.id, id)));
  return row ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "read", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No organization with that id.");
    return apiJson(serializeOrganization(row));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No organization with that id.");

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const patch: Partial<typeof organizations.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return apiError(400, "invalid_name", "name cannot be empty.");
      patch.name = name.slice(0, 200);
    }
    if (body.email_domains !== undefined) patch.emailDomains = readDomains(body.email_domains);
    if (body.shared_tickets !== undefined) patch.sharedTickets = body.shared_tickets === true;
    if (body.notes !== undefined) {
      patch.notes = body.notes === null ? null : String(body.notes).slice(0, 2000);
    }
    if (
      body.custom_fields !== undefined &&
      typeof body.custom_fields === "object" &&
      body.custom_fields !== null &&
      !Array.isArray(body.custom_fields)
    ) {
      patch.customFields = body.custom_fields as Record<string, unknown>;
    }
    if (Object.keys(patch).length === 0) return apiJson(serializeOrganization(row));

    const [updated] = await db
      .update(organizations)
      .set(patch)
      .where(eq(organizations.id, row.id))
      .returning();
    return apiJson(serializeOrganization(updated!));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withApi(request, "write", async ({ tenant }) => {
    const { id } = await params;
    const row = await load(tenant.id, id);
    if (!row) return apiError(404, "not_found", "No organization with that id.");

    /*
     * Tickets are detached first, deliberately.
     *
     * `tickets.organization_id` carries no ON DELETE clause, so Postgres
     * defaults to NO ACTION: deleting a company that has ever had a ticket
     * would fail on a foreign key violation, and the API would answer 500 for
     * what is a perfectly ordinary request. Nulling the column keeps every
     * ticket and its conversation — a customer's history must outlive the
     * company record it happened to be filed under.
     *
     * The contact ↔ organization links go on their own (ON DELETE CASCADE).
     */
    await db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({ organizationId: null })
        .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.organizationId, row.id)));
      await tx.delete(organizations).where(eq(organizations.id, row.id));
    });
    return new Response(null, { status: 204 });
  });
}
