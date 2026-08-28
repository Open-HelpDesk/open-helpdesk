"use server";

/**
 * The two things the V2 topbar writes: the agent's availability and the
 * notification waterline.
 *
 * Both are scoped to the signed-in agent by `requireAgent` — neither takes an
 * id, so neither can be pointed at a colleague.
 */
import { eq } from "drizzle-orm";
import { db, users } from "@openhelpdesk/db";
import { requireAgent } from "@/lib/session";
import { revalidatePath } from "next/cache";

/** Availability decides whether automatic assignment may pick this agent. */
export async function setAvailability(available: boolean) {
  const { agent } = await requireAgent();
  await db.update(users).set({ available }).where(eq(users.id, agent.id));
  revalidatePath("/app", "layout");
}

/** "Mark all read" — moves the waterline to now; see lib/notifications.ts. */
export async function markNotificationsRead() {
  const { agent } = await requireAgent();
  await db.update(users).set({ notificationsReadAt: new Date() }).where(eq(users.id, agent.id));
  revalidatePath("/app", "layout");
}
