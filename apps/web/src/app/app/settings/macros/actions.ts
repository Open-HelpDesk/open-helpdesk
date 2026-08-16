"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, macros } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

export async function saveMacro(formData: FormData) {
  const { tenant, agent } = await requireAgent();
  const macroId = String(formData.get("macroId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  const insertText = String(formData.get("insertText") ?? "").trim();
  const setStatus = String(formData.get("setStatus") ?? "");
  if (!name || !insertText) return;

  const actions: { type: string; value: string }[] = [{ type: "insert_text", value: insertText }];
  if (["new", "open", "waiting", "on_hold", "resolved", "closed"].includes(setStatus)) {
    actions.push({ type: "set_status", value: setStatus });
  }

  if (macroId) {
    await db
      .update(macros)
      .set({ name, category, actions })
      .where(and(eq(macros.tenantId, tenant.id), eq(macros.id, macroId)));
  } else {
    await db.insert(macros).values({
      tenantId: tenant.id,
      name,
      category,
      actions,
      availability: "everyone",
      ownerId: agent.id,
    });
  }

  revalidatePath("/app/settings/macros");
  redirect("/app/settings/macros");
}

export async function deleteMacro(formData: FormData) {
  const { tenant } = await requireAgent();
  const macroId = String(formData.get("macroId"));
  await db.delete(macros).where(and(eq(macros.tenantId, tenant.id), eq(macros.id, macroId)));
  revalidatePath("/app/settings/macros");
}
