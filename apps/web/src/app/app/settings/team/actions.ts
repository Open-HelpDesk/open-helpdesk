"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, mailboxes, teamMembers, teams, tickets, users } from "@openhelpdesk/db";
import { and, eq, inArray } from "drizzle-orm";
import { occupiedSeats, seatLimitFor } from "@/lib/entitlements";
import { sendAgentInvite } from "@/lib/agent-invite";
import { requireManager } from "../guard";


/** ST-02 — Invitation multi-emails (séparés par des virgules) avec un rôle commun. */
export async function inviteAgents(formData: FormData) {
  const { tenant } = await requireManager();
  const emailsRaw = String(formData.get("emails") ?? "");
  const role = String(formData.get("role") ?? "agent");
  const safeRole = (["admin", "agent", "viewer"].includes(role) ? role : "agent") as
    | "admin"
    | "agent"
    | "viewer";

  const emails = emailsRaw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (emails.length === 0) return;

  // Quota de sièges (cloud) : les invitations payantes ne dépassent pas la limite
  // du plan. Les emails déjà connus ne consomment rien — l'insert ci-dessous est
  // en onConflictDoNothing.
  const limit = seatLimitFor(tenant);
  if (limit !== null && safeRole !== "viewer") {
    const existing = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), inArray(users.email, emails)));
    const known = new Set(existing.map((u) => u.email.toLowerCase()));
    const fresh = emails.filter((e) => !known.has(e)).length;
    if (fresh > 0 && (await occupiedSeats(tenant.id)) + fresh > limit) {
      redirect("/app/settings/team?error=seats");
    }
  }

  for (const email of emails) {
    const localPart = email.split("@")[0] ?? email;
    const name = localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join(" ");
    // returning() ne rend que les lignes réellement insérées : une adresse
    // déjà membre ne reçoit pas d'email.
    const inserted = await db
      .insert(users)
      .values({ tenantId: tenant.id, email, name: name || email, role: safeRole, status: "invited" })
      .onConflictDoNothing()
      .returning({ id: users.id, email: users.email });
    for (const row of inserted) {
      await sendAgentInvite(tenant, row);
    }
  }

  revalidatePath("/app/settings/team");
  redirect("/app/settings/team?saved=1");
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

  // Passage viewer → rôle payant : consomme un siège (cloud).
  if (target.role === "viewer" && role !== "viewer" && target.status !== "disabled") {
    const limit = seatLimitFor(tenant);
    if (limit !== null && (await occupiedSeats(tenant.id)) >= limit) {
      redirect("/app/settings/team?error=seats");
    }
  }

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
    // Réactivation : le siège doit être disponible (cloud).
    const limit = seatLimitFor(tenant);
    if (limit !== null && target.role !== "viewer" && (await occupiedSeats(tenant.id)) >= limit) {
      redirect("/app/settings/team?error=seats");
    }
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

/** Renvoi d'invitation : nouveau jeton, nouvel email. */
export async function resendInvite(formData: FormData) {
  const { tenant } = await requireManager();
  const userId = String(formData.get("userId"));
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.id, userId)));
  if (!target || target.status !== "invited") return;
  await sendAgentInvite(tenant, { id: target.id, email: target.email });
  revalidatePath("/app/settings/team");
}

/* ---------- Onglet Équipes — CRUD teams / teamMembers ---------- */

function memberIdsOf(formData: FormData): string[] {
  return formData.getAll("memberIds").map(String).filter(Boolean);
}

export async function createTeam(formData: FormData) {
  const { tenant } = await requireManager();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  const bhId = String(formData.get("businessHoursId") ?? "");

  const [team] = await db
    .insert(teams)
    .values({ tenantId: tenant.id, name, businessHoursId: bhId || null })
    .returning();

  const memberIds = memberIdsOf(formData);
  if (team && memberIds.length > 0) {
    const valid = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), inArray(users.id, memberIds)));
    if (valid.length > 0) {
      await db
        .insert(teamMembers)
        .values(valid.map((u) => ({ tenantId: tenant.id, teamId: team.id, userId: u.id })))
        .onConflictDoNothing();
    }
  }

  revalidatePath("/app/settings/team");
  redirect("/app/settings/team?tab=teams&saved=1");
}

export async function updateTeam(formData: FormData) {
  const { tenant } = await requireManager();
  const teamId = String(formData.get("teamId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const bhId = String(formData.get("businessHoursId") ?? "");
  if (!teamId || !name) return;

  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.tenantId, tenant.id), eq(teams.id, teamId)));
  if (!team) return;

  await db
    .update(teams)
    .set({ name, businessHoursId: bhId || null })
    .where(eq(teams.id, team.id));

  // Remplace la composition (membres cochés dans le drawer).
  await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
  const memberIds = memberIdsOf(formData);
  if (memberIds.length > 0) {
    const valid = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), inArray(users.id, memberIds)));
    if (valid.length > 0) {
      await db
        .insert(teamMembers)
        .values(valid.map((u) => ({ tenantId: tenant.id, teamId: team.id, userId: u.id })))
        .onConflictDoNothing();
    }
  }

  revalidatePath("/app/settings/team");
  redirect("/app/settings/team?tab=teams&saved=1");
}

export async function deleteTeam(formData: FormData) {
  const { tenant } = await requireManager();
  const teamId = String(formData.get("teamId") ?? "");
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.tenantId, tenant.id), eq(teams.id, teamId)));
  if (!team) return;

  // Détache les références non-cascade avant suppression.
  await db
    .update(tickets)
    .set({ teamId: null })
    .where(and(eq(tickets.tenantId, tenant.id), eq(tickets.teamId, team.id)));
  await db
    .update(mailboxes)
    .set({ defaultTeamId: null })
    .where(and(eq(mailboxes.tenantId, tenant.id), eq(mailboxes.defaultTeamId, team.id)));
  await db.delete(teams).where(eq(teams.id, team.id));

  revalidatePath("/app/settings/team");
  redirect("/app/settings/team?tab=teams");
}
