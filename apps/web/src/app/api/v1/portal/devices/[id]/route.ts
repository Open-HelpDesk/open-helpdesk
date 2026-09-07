/**
 * /api/v1/portal/devices/{id} — stop notifying a customer's phone (MC-05).
 *
 * Revoked rather than deleted, like the agents' registrations: a rejected token
 * has to be distinguishable from one that was never registered when a delivery
 * fails. A customer can only revoke their own.
 */
import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, pushDevices } from "@openhelpdesk/db";
import { apiError } from "@/lib/api";
import { withPortalApi } from "@/lib/portal-api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return apiError(404, "not_found", "No device with that id.");
    }
    const [row] = await db
      .update(pushDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(pushDevices.tenantId, tenant.id),
          eq(pushDevices.id, id),
          eq(pushDevices.contactId, contact.id),
          isNull(pushDevices.revokedAt),
        ),
      )
      .returning({ id: pushDevices.id });
    if (!row) return apiError(404, "not_found", "No device with that id.");
    return new Response(null, { status: 204 });
  });
}
