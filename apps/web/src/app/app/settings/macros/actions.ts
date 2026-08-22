"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, macros, teams } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireManager } from "../guard";

/**
 * ST-06 — Saving a macro (drawer): inserted text OR internal note,
 * optional applied status, availability (all agents / team).
 */
export async function saveMacro(formData: FormData) {
  const { tenant, agent } = await requireManager();
  const macroId = String(formData.get("macroId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const category = String(formData.get("category") ?? "").trim().slice(0, 80) || null;
  const insertKind = formData.get("insertKind") === "insert_note" ? "insert_note" : "insert_text";
  const insertText = String(formData.get("insertText") ?? "").trim().slice(0, 8000);
  const setStatus = String(formData.get("setStatus") ?? "");
  const availabilityRaw = String(formData.get("availability") ?? "everyone");
  if (!name || !insertText) return;

  const actions: { type: string; value: string }[] = [{ type: insertKind, value: insertText }];
  if (["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(setStatus)) {
    actions.push({ type: "set_status", value: setStatus });
  }

  let availability: "everyone" | "team" = "everyone";
  let teamId: string | null = null;
  if (availabilityRaw.startsWith("team:")) {
    const candidate = availabilityRaw.slice(5);
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.tenantId, tenant.id), eq(teams.id, candidate)));
    if (team) {
      availability = "team";
      teamId = team.id;
    }
  }

  if (macroId) {
    await db
      .update(macros)
      .set({ name, category, actions, availability, teamId })
      .where(and(eq(macros.tenantId, tenant.id), eq(macros.id, macroId)));
  } else {
    await db.insert(macros).values({
      tenantId: tenant.id,
      name,
      category,
      actions,
      availability,
      teamId,
      ownerId: agent.id,
    });
  }

  revalidatePath("/app/settings/macros");
  redirect("/app/settings/macros?saved=1");
}

export async function deleteMacro(formData: FormData) {
  const { tenant } = await requireManager();
  const macroId = String(formData.get("macroId"));
  await db.delete(macros).where(and(eq(macros.tenantId, tenant.id), eq(macros.id, macroId)));
  revalidatePath("/app/settings/macros");
  redirect("/app/settings/macros?saved=1");
}
