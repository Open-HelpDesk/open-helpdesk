/**
 * /api/v1/teams — Teams, as used by assignment rules and views.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, teams } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeTeam, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(teams.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(teams.id, cursor));
    }

    const rows = await db
      .select()
      .from(teams)
      .where(and(...filters))
      .orderBy(asc(teams.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeTeam), rows.length > limit ? page.at(-1)!.id : null);
  });
}
