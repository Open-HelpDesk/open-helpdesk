/**
 * /api/v1/notifications/read — "Mark all read" (MA-06).
 *
 * Moves the agent's waterline to now, which is the only meaning "read" can have
 * for a feed that is derived rather than stored. It is shared with the web
 * topbar's own button, so clearing the badge on a phone clears it in the
 * browser too — which is what an agent expects from having read the thing once.
 */
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@openhelpdesk/db";
import { apiJson, requireDeviceAgent, withApi } from "@/lib/api";

export async function POST(request: NextRequest) {
  return withApi(request, "write", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const readAt = new Date();
    await db.update(users).set({ notificationsReadAt: readAt }).where(eq(users.id, agent.id));
    return apiJson({ read_at: readAt.toISOString(), unread_count: 0 });
  });
}
