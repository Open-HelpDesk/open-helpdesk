/**
 * /api/v1/portal/notifications — news about a customer's own requests (MC-04).
 *
 * Two things are news to a customer: somebody answered, and the request they
 * were waiting on was resolved. Their own messages are not, and neither is
 * anything on a colleague's request — belonging to an organization that shares
 * its tickets lets someone read them, which is not the same as being told about
 * them.
 *
 * Derived like the agent feed, with the same waterline meaning of "read"
 * (`contacts.notifications_read_at`).
 */
import type { NextRequest } from "next/server";
import { apiJson } from "@/lib/api";
import { contactNotificationEvents } from "@/lib/notifications";
import { withPortalApi } from "@/lib/portal-api";

export async function GET(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const events = await contactNotificationEvents(
      tenant.id,
      contact.id,
      contact.notificationsReadAt,
    );
    return apiJson({
      data: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        request_number: e.ticketNumber,
        request_subject: e.ticketSubject,
        actor_name: e.actorName,
        at: e.at.toISOString(),
        read: e.read,
      })),
      unread_count: events.filter((e) => !e.read).length,
      read_at: contact.notificationsReadAt?.toISOString() ?? null,
    });
  });
}
