"use server";

import { revalidatePath } from "next/cache";
import { db, tickets, users } from "@openhelpdesk/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

async function requireManager() {
  const current = await requireAgent();
  if (current.agent.role !== "owner" && current.agent.role !== "admin") {
    throw new Error("Réservé aux rôles Owner et Admin.");
  }
  return current;
}

export async function inviteAgent(formData: FormData) {
  const { tenant } = await requireManager();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "agent");
  if (!email || !name) return;

  await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email,
      name,
      role: (["admin", "agent", "viewer"].includes(role) ? role : "agent") as
        | "admin"
        | "agent"
        | "viewer",
      status: "invited",
    })
    .onConflictDoNothing();

  revalidatePath("/app/settings/team");
}

export async function updateAgentRole(formData: FormData) {
  const { tenant, agent: me } = await requireManager();
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (userId === me.id) return; // on ne modifie pas son propre rôle
  if (!["owner", "admin", "agent", "viewer"].includes(role)) return;
  if (role === "owner" && me.role !== "owner") return; // seul un owner nomme un owner

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  if (!target) return;
  if (target.role === "owner" && me.role !== "owner") return;

  await db
    .update(users)
    .set({ role: role as "owner" | "admin" | "agent" | "viewer" })
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  revalidatePath("/app/settings/team");
}

/** Désactivation : les tickets ouverts de l'agent repassent en non-assignés (ST-02). */
export async function toggleAgentActive(formData: FormData) {
  const { tenant, agent: me } = await requireManager();
  const userId = String(formData.get("userId"));
  if (userId === me.id) return; // on ne se désactive pas soi-même

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  if (!target) return;
  if (target.role === "owner" && me.role !== "owner") return;

  if (target.status === "disabled") {
    await db.update(users).set({ status: "active" }).where(eq(users.id, target.id));
  } else {
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, target.id));
    await db
      .update(tickets)
      .set({ assigneeId: null, updatedAt: new Date() })
      .where(
        and(
          eq(tickets.tenantId, tenant.id),
          eq(tickets.assigneeId, target.id),
          inArray(tickets.status, ["new", "open", "waiting", "on_hold"]),
        ),
      );
  }
  revalidatePath("/app/settings/team");
}
