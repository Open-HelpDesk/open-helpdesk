"use server";

import { eq } from "drizzle-orm";
import { db, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";

/**
 * The tour has been seen — whether it was walked through or dismissed.
 *
 * No revalidation: the overlay has already removed itself on the client, and
 * refreshing the inbox underneath it would only re-run the ticket queries to
 * change nothing on screen. The flag matters on the NEXT visit.
 */
export async function markTourSeen(): Promise<void> {
  const { agent } = await requireAgent();
  if (agent.tourSeenAt) return;
  await db.update(users).set({ tourSeenAt: new Date() }).where(eq(users.id, agent.id));
}
