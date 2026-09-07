/**
 * /api/v1/notifications — what happened on my tickets while I was away (MA-06).
 *
 * The same feed the web topbar shows, as data rather than as sentences: the app
 * writes its own wording, in the language of the phone. Both come from
 * `agentNotificationEvents`, so the two surfaces cannot end up announcing
 * different things.
 *
 * `read` is not per item and cannot be: the feed is derived from tickets and
 * messages, so there is no row to mark. It is a waterline — everything older
 * than `read_at` counts as read — which is exactly what the design's "Mark all
 * read" does (see POST ./read).
 */
import type { NextRequest } from "next/server";
import { apiJson, requireDeviceAgent, withApi } from "@/lib/api";
import { agentNotificationEvents } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async (auth) => {
    const agent = requireDeviceAgent(auth);
    if (agent instanceof Response) return agent;

    const events = await agentNotificationEvents(
      auth.tenant.id,
      agent.id,
      agent.notificationsReadAt,
    );
    return apiJson({
      data: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        ticket_number: e.ticketNumber,
        ticket_subject: e.ticketSubject,
        actor_name: e.actorName,
        at: e.at.toISOString(),
        read: e.read,
      })),
      unread_count: events.filter((e) => !e.read).length,
      read_at: agent.notificationsReadAt?.toISOString() ?? null,
    });
  });
}
