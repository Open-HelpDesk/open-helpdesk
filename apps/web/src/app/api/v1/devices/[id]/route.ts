/**
 * /api/v1/devices/{id} — stop sending push notifications to this phone.
 *
 * The app calls it when the agent turns notifications off (MA-07) and before
 * signing out; the operating system also stops honouring a token the user has
 * revoked, and a gateway that rejects one is another reason to land here.
 *
 * A registration is revoked, not deleted: `revoked_at` is what lets a rejected
 * token be told apart from one that was never registered when a delivery fails.
 * An agent can only revoke their own — a device is not workspace furniture.
 */
import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, pushDevices } from "@openhelpdesk/db";
import { apiError, requireDeviceAgent, withApi } from "@/lib/api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(request, "write", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) {
      return apiError(404, "not_found", "No device with that id.");
    }

    const [row] = await db
      .update(pushDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(pushDevices.tenantId, auth.tenant.id),
          eq(pushDevices.id, id),
          eq(pushDevices.userId, agent.id),
          isNull(pushDevices.revokedAt),
        ),
      )
      .returning({ id: pushDevices.id });
    if (!row) return apiError(404, "not_found", "No device with that id.");

    return new Response(null, { status: 204 });
  });
}
