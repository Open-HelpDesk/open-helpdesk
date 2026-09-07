/**
 * /api/v1/portal/notifications/read — "Mark all read", customer side (MC-04).
 */
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { contacts, db } from "@openhelpdesk/db";
import { apiJson } from "@/lib/api";
import { withPortalApi } from "@/lib/portal-api";

export async function POST(request: NextRequest) {
  return withPortalApi(request, async ({ tenant, contact }) => {
    const readAt = new Date();
    await db
      .update(contacts)
      .set({ notificationsReadAt: readAt })
      .where(and(eq(contacts.tenantId, tenant.id), eq(contacts.id, contact.id)));
    return apiJson({ read_at: readAt.toISOString(), unread_count: 0 });
  });
}
