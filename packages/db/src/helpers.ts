import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { tickets } from "./schema";

/**
 * Per-tenant sequential number — the unique index (tenant_id, number) guards
 * against races: on a collision, the caller retries.
 */
export async function nextTicketNumber(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tickets.number}), 0)` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  return (row?.max ?? 0) + 1;
}
