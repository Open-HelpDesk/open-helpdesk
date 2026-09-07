/**
 * /api/v1/tags — the tags actually in use, with how many tickets carry each.
 *
 * Derived from the tickets rather than stored in a table: the product has no
 * tag registry, and inventing one here would create a second source of truth
 * that drifts the first time someone renames a tag in a ticket.
 */
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, tickets } from "@openhelpdesk/db";
import { apiList, withApi } from "@/lib/api";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant }) => {
    const rows = await db
      .select({
        name: sql<string>`tag`,
        ticket_count: sql<number>`count(*)::int`,
      })
      .from(sql`${tickets}, unnest(${tickets.tags}) as tag`)
      .where(eq(tickets.tenantId, tenant.id))
      .groupBy(sql`tag`)
      .orderBy(sql`count(*) desc, tag asc`);
    // Small and bounded by how many distinct tags a workspace uses: returned
    // whole rather than paginated, and the envelope stays the same shape.
    return apiList(rows, null);
  });
}
