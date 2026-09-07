/**
 * /api/v1/views — Saved ticket views, their conditions, and what they hold.
 *
 * Keyset-paginated on the identifier so a caller can walk the collection while
 * the workspace keeps changing.
 *
 * Each view carries its `count`, because that is what the mobile view switcher
 * draws (MA-01) and the only other way to get it was to page through
 * GET /tickets with the view's own conditions rebuilt client-side — a filter
 * language reimplemented in every client, drifting from this one. The counts are
 * the same query the web inbox runs for its sidebar, and they are computed for
 * the current page only.
 */
import type { NextRequest } from "next/server";
import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import { db, views } from "@openhelpdesk/db";
import { apiError, apiList, readPage, serializeView, withApi } from "@/lib/api";
import { countViewMatches, type ViewCondition } from "@/lib/data";

export async function GET(request: NextRequest) {
  return withApi(request, "read", async ({ tenant, agent }) => {
    const { limit, cursor } = readPage(request);
    const filters = [eq(views.tenantId, tenant.id)];
    /*
     * An agent sees what the web workspace shows them: everything shared with
     * the workspace or a team, plus their own private views. A colleague's
     * private view is theirs. A workspace API key has no agent to compare
     * against and keeps the whole collection — it is the workspace's own
     * credential, and an export that silently dropped rows would be worse.
     */
    if (agent) {
      filters.push(
        or(
          inArray(views.shared, ["team", "everyone"]),
          and(eq(views.shared, "private"), eq(views.ownerId, agent.id)),
        )!,
      );
    }
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
    const counts = await Promise.all(
      page.map((v) => countViewMatches(tenant.id, (v.conditions as ViewCondition[]) ?? [])),
    );
    return apiList(
      page.map((v, i) => ({ ...serializeView(v), count: counts[i]! })),
      rows.length > limit ? page.at(-1)!.id : null,
    );
  });
}
