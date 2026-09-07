/**
 * /api/v1/csat — Satisfaction responses left by customers.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, csatResponses } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeCsat, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(csatResponses.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(csatResponses.id, cursor));
    }

    const rows = await db
      .select()
      .from(csatResponses)
      .where(and(...filters))
      .orderBy(asc(csatResponses.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeCsat), rows.length > limit ? page.at(-1)!.id : null);
  });
}
