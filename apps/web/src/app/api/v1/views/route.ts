/**
 * /api/v1/views — Saved ticket views and their conditions.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, views } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeView, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(views.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(views.id, cursor));
    }

    const rows = await db
      .select()
      .from(views)
      .where(and(...filters))
      .orderBy(asc(views.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeView), rows.length > limit ? page.at(-1)!.id : null);
  });
}
