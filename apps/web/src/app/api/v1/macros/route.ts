/**
 * /api/v1/macros — Saved replies and their actions.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, macros } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeMacro, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(macros.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(macros.id, cursor));
    }

    const rows = await db
      .select()
      .from(macros)
      .where(and(...filters))
      .orderBy(asc(macros.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeMacro), rows.length > limit ? page.at(-1)!.id : null);
  });
}
