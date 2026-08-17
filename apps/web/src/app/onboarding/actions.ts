"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants, users } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

/** Étape 1 — Identité : nom du workspace + couleur d'accent (tenants.branding). */
export async function saveIdentity(formData: FormData) {
  const { tenant } = await requireAgent();
  const name = String(formData.get("name") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();

  const branding = { ...((tenant.branding ?? {}) as Record<string, unknown>) };
  if (/^#[0-9a-fA-F]{6}$/.test(accentColor)) branding.accentColor = accentColor;

  await db
    .update(tenants)
    .set({
      ...(name ? { name } : {}),
      branding,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));

  revalidatePath("/onboarding");
  redirect("/onboarding?step=2");
}

/** Étape 3 — Équipe : chaque ligne email + rôle crée un utilisateur « invité ». */
export async function inviteTeam(formData: FormData) {
  const { tenant } = await requireAgent();
  const emails = formData.getAll("email").map((e) => String(e).trim().toLowerCase());
  const roles = formData.getAll("role").map((r) => String(r));

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    if (!email || !email.includes("@")) continue;
    const role = ["admin", "agent", "viewer"].includes(roles[i] ?? "")
      ? (roles[i] as "admin" | "agent" | "viewer")
      : "agent";
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email,
        name: email.split("@")[0] ?? email,
        role,
        status: "invited",
      })
      .onConflictDoNothing();
  }

  revalidatePath("/onboarding");
  redirect("/onboarding?step=4");
}
