"use server";

import { revalidatePath } from "next/cache";
import { db, orgSsoConnections, tenants } from "@openhelpdesk/db";
import { and, eq, not } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "@/app/app/settings/guard";
import { getT } from "@/i18n/server";

async function requirePro() {
  const current = await requireManager();
  if (!entitlementsFor(current.tenant.plan).customerSso) {
    const t = await getT();
    throw new Error(t("app.settings.sso.customerProOnly"));
  }
  return current;
}

/** ST-14 — Interrupteur global de délégation SSO (tenants.ssoDelegationEnabled). */
export async function toggleSsoDelegation() {
  const { tenant } = await requirePro();
  await db
    .update(tenants)
    .set({ ssoDelegationEnabled: not(tenants.ssoDelegationEnabled) })
    .where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/customer-sso");
}

/** Seule action du drawer de détail : désactiver la connexion d'une organisation. */
export async function disableOrgConnection(formData: FormData) {
  const { tenant } = await requirePro();
  const connectionId = String(formData.get("connectionId") ?? "");
  await db
    .update(orgSsoConnections)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(and(eq(orgSsoConnections.tenantId, tenant.id), eq(orgSsoConnections.id, connectionId)));
  revalidatePath("/app/settings/customer-sso");
}
