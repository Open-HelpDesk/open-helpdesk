"use server";

import { revalidatePath } from "next/cache";
import { db, tenants } from "@openhelpdesk/db";
import { eq } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

export async function saveCsatConfig(formData: FormData) {
  const { tenant } = await requireAgent();
  const enabled = formData.get("enabled") === "on";
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);

  await db
    .update(tenants)
    .set({ csatConfig: { enabled, question: question || undefined } })
    .where(eq(tenants.id, tenant.id));

  revalidatePath("/app/settings/csat");
}
