/**
 * /api/v1/ticket-fields — Custom ticket fields. `key` is what appears in a ticket's `custom_fields`.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, ticketFields } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeField, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(ticketFields.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(ticketFields.id, cursor));
    }

    const rows = await db
      .select()
      .from(ticketFields)
      .where(and(...filters))
      .orderBy(asc(ticketFields.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeField), rows.length > limit ? page.at(-1)!.id : null);
  });
}
