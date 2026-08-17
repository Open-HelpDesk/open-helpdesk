"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { requireManager } from "../guard";

/**
 * ST-08 — csatConfig jsonb : { enabled, question, delayHours, reminderDays,
 * exclusions }. Compatible avec CsatConfig du moteur ({ enabled, question }).
 */
export async function saveCsatConfig(formData: FormData) {
  const { tenant } = await requireManager();
  const enabled = formData.get("enabled") === "on";
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  const delayHours = Number(formData.get("delayHours") ?? 2);
  const reminderDays = Number(formData.get("reminderDays") ?? 0);
  const exclusions = formData
    .getAll("exclusions")
    .map((e) => String(e).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 30);

  await db
    .update(tenants)
    .set({
      csatConfig: {
        enabled,
        question: question || undefined,
        delayHours: [0, 1, 2, 24].includes(delayHours) ? delayHours : 2,
        reminderDays: [0, 3, 7].includes(reminderDays) ? reminderDays : 0,
        exclusions,
      },
    })
    .where(eq(tenants.id, tenant.id));

  revalidatePath("/app/settings/csat");
  redirect("/app/settings/csat?saved=1");
}
