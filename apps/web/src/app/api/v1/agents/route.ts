/**
 * /api/v1/agents — Agents of the workspace. Read-only: accounts are created by invitation in
 * the product, never by an integration.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, users } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeAgent, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(users.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(users.id, cursor));
    }

    const rows = await db
      .select()
      .from(users)
      .where(and(...filters))
      .orderBy(asc(users.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return apiList(page.map(serializeAgent), rows.length > limit ? page.at(-1)!.id : null);
  });
}
