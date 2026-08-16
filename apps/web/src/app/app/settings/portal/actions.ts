"use server";

import { revalidatePath } from "next/cache";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

export async function savePortalConfig(formData: FormData) {
  const { tenant } = await requireAgent();
  const color = String(formData.get("widgetColor") ?? "");
  await db
    .update(tenants)
    .set({
      portalConfig: {
        welcomeText: String(formData.get("welcomeText") ?? "").trim().slice(0, 200) || undefined,
        widget: {
          enabled: formData.get("widgetEnabled") === "on",
          color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined,
          position: formData.get("widgetPosition") === "left" ? "left" : "right",
          title: String(formData.get("widgetTitle") ?? "").trim().slice(0, 60) || undefined,
        },
      },
    })
    .where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/portal");
}
