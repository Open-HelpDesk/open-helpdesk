/**
 * /api/v1/portal/devices — notify a customer's phone (MC-04).
 *
 * What a customer wants to be woken for is narrow and obvious: an agent
 * answered their request. Same table and same upsert-on-token rule as the
 * agents' registrations (see /api/v1/devices) — the operating system rotates
 * these tokens, and a handset changes hands, so the row belongs to whoever
 * registered it last and never to both.
 */
import type { NextRequest } from "next/server";
import { db, pushDevices } from "@openhelpdesk/db";
import { apiError, apiJson, readJson, serializePushDevice } from "@/lib/api";
import { withPortalApi } from "@/lib/portal-api";

export async function POST(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact, sessionId }) => {
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
        tenantId: tenant.id,
        sessionId,
        contactId: contact.id,
        platform,
        pushToken,
        deviceName,
        appVersion,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pushDevices.tenantId, pushDevices.pushToken],
        set: {
          sessionId,
          contactId: contact.id,
          // Never both owners: a phone an agent used and a customer now holds
          // must stop receiving the agent's notifications.
          userId: null,
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
