/**
 * /api/v1/portal/auth/logout — sign this phone out of the customer app (MC-05).
 *
 * Revokes this session and the push registrations that came with it. The
 * customer's other devices, and the browser they may be signed in on, are left
 * alone: signing out of one thing has never meant signing out of everything.
 */
import type { NextRequest } from "next/server";
import { revokeDeviceSession } from "@/lib/device-auth";
import { withPortalApi } from "@/lib/portal-api";

export async function POST(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, sessionId }) => {
    await revokeDeviceSession(tenant.id, sessionId);
    return new Response(null, { status: 204 });
  });
}
