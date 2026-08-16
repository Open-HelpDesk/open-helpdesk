"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, slaPolicies } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";
import { requireAgent } from "@/lib/session";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
const COLUMNS = ["firstReplyMin", "nextReplyMin", "resolveMin"] as const;

export async function saveSlaPolicy(formData: FormData) {
  const { tenant } = await requireAgent();
  const policyId = String(formData.get("policyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  let conditions: unknown[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("conditions") ?? "[]"));
    if (Array.isArray(parsed)) conditions = parsed;
  } catch {
    /* conditions vides */
  }

  const targets: Record<string, Record<string, number>> = {};
  for (const prio of PRIORITIES) {
    for (const col of COLUMNS) {
      const raw = String(formData.get(`t_${prio}_${col}`) ?? "").trim();
      const value = Number(raw);
      if (raw !== "" && Number.isFinite(value) && value > 0) {
        targets[prio] = { ...targets[prio], [col]: value };
      }
    }
  }

  if (policyId) {
    await db
      .update(slaPolicies)
      .set({ name, conditions, targets })
      .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.id, policyId)));
  } else {
    const existing = await db
      .select({ position: slaPolicies.position })
      .from(slaPolicies)
      .where(eq(slaPolicies.tenantId, tenant.id));
    const position = existing.length > 0 ? Math.max(...existing.map((p) => p.position)) + 1 : 0;
    await db.insert(slaPolicies).values({ tenantId: tenant.id, name, conditions, targets, position });
  }

  revalidatePath("/app/settings/sla");
  redirect("/app/settings/sla");
}

/** La politique par défaut n'est pas supprimable (ST-07). */
export async function deleteSlaPolicy(formData: FormData) {
  const { tenant } = await requireAgent();
  const policyId = String(formData.get("policyId"));
  await db
    .delete(slaPolicies)
    .where(
      and(
        eq(slaPolicies.tenantId, tenant.id),
        eq(slaPolicies.id, policyId),
        eq(slaPolicies.isDefault, false),
      ),
    );
  revalidatePath("/app/settings/sla");
}
