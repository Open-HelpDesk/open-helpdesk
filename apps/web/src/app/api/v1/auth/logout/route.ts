/**
 * /api/v1/auth/logout — sign this device out (MA-07 "Sign out").
 *
 * Revokes the session the call is authenticated with, and nothing else: signing
 * out of a phone must not sign the agent out of the browser they left the office
 * on, nor of their other phone. The push registrations tied to this session go
 * with it (see revokeDeviceSession) — a device that can no longer read the
 * workspace should stop being told about it.
 *
 * Idempotent: a second call presents a revoked token and gets the 401 that the
 * app should already have concluded from the first.
 */
import type { NextRequest } from "next/server";
import { requireDeviceAgent, withApi } from "@/lib/api";
import { revokeDeviceSession } from "@/lib/device-auth";

export async function POST(request: NextRequest) {
  return withApi(request, "read", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;
    // `keyId` is the device session's own id when the caller is a phone.
    await revokeDeviceSession(auth.tenant.id, auth.keyId);
    return new Response(null, { status: 204 });
  });
}
