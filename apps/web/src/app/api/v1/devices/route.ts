/**
 * /api/v1/devices — register this phone for push notifications (MA-06, MC-04).
 *
 * The events worth waking a phone for are the ones the agent cannot discover by
 * looking: a ticket assigned to them, a customer who answered, an SLA about to
 * be missed. Delivering those needs an address per device, and the product had
 * nowhere to keep one.
 *
 * Registration is an upsert on the token rather than an insert, because the
 * operating system rotates it and reissues it across reinstalls: a plain insert
 * would leave a trail of rows, some pointing at the same phone and one of them
 * at whoever used it before. The token belongs to whoever registered it last.
 */
import type { NextRequest } from "next/server";
import { db, pushDevices } from "@openhelpdesk/db";
import {
  apiError,
  apiJson,
  readJson,
  requireDeviceAgent,
  serializePushDevice,
  withApi,
} from "@/lib/api";

export async function POST(request: NextRequest) {
  return withApi(request, "write", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const body = await readJson(request);
    if (body instanceof Response) return body;

    const pushToken = String(body.push_token ?? "").trim();
    if (!pushToken || pushToken.length > 512) {
      return apiError(400, "invalid_body", "Provide the APNs or FCM token as push_token.");
    }
    const platform = body.platform;
    if (platform !== "ios" && platform !== "android") {
      return apiError(400, "invalid_platform", 'Platform must be "ios" or "android".');
    }
    const deviceName =
      typeof body.device_name === "string" ? body.device_name.trim().slice(0, 80) || null : null;
    const appVersion =
      typeof body.app_version === "string" ? body.app_version.trim().slice(0, 32) || null : null;

    const [row] = await db
      .insert(pushDevices)
      .values({
        tenantId: auth.tenant.id,
        sessionId: auth.keyId,
        userId: agent.id,
        platform,
        pushToken,
        deviceName,
        appVersion,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pushDevices.tenantId, pushDevices.pushToken],
        set: {
          sessionId: auth.keyId,
          userId: agent.id,
          // The same handset can be handed over; a stale contact owner on it
          // would send an agent's notifications to a customer's app.
          contactId: null,
          platform,
          deviceName,
          appVersion,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
      })
      .returning();

    return apiJson(serializePushDevice(row!), 201);
  });
}
