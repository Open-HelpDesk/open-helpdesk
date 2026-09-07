/**
 * /api/v1/kb/categories — the knowledge base's two-level tree.
 *
 * Read-only for now: creating a category is a structural decision that shows up
 * on the public help centre, and no integration has asked to make it.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, kbCategories } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeCategory, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(kbCategories.tenantId, tenant.id)];
    if (cursor) {
      if (!/^[0-9a-f-]{36}$/.test(cursor)) {
        return apiError(400, "invalid_cursor", "Malformed cursor.");
      }
      filters.push(gt(kbCategories.id, cursor));
    }
    const rows = await db
      .select()
      .from(kbCategories)
      .where(and(...filters))
      .orderBy(asc(kbCategories.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return apiList(page.map(serializeCategory), rows.length > limit ? page.at(-1)!.id : null);
  });
}
