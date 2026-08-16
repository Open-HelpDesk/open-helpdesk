import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { tickets } from "./schema";

/**
 * Numéro séquentiel par tenant — l'index unique (tenant_id, number) protège les
 * courses : en cas de collision, l'appelant retente.
 */
export async function nextTicketNumber(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${tickets.number}), 0)` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenantId));
  return (row?.max ?? 0) + 1;
}
