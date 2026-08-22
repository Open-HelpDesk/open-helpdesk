"use server";

import { revalidatePath } from "next/cache";
import { db, orgSsoConnections, tenants } from "@openhelpdesk/db";
import { and, eq, not } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "@/app/app/settings/guard";
import { getT } from "@/i18n/server";

async function requirePro() {
  const current = await requireManager();
  if (!entitlementsFor(current.tenant).customerSso) {
    const t = await getT();
    throw new Error(t("app.settings.sso.customerEnterpriseOnly"));
  }
  return current;
}

/** ST-14 — Global SSO delegation switch (tenants.ssoDelegationEnabled). */
export async function toggleSsoDelegation() {
  const { tenant } = await requirePro();
  await db
    .update(tenants)
    .set({ ssoDelegationEnabled: not(tenants.ssoDelegationEnabled) })
    .where(eq(tenants.id, tenant.id));
  revalidatePath("/app/settings/customer-sso");
}

/** The detail drawer's only action: disable an organization's connection. */
export async function disableOrgConnection(formData: FormData) {
  const { tenant } = await requirePro();
  const connectionId = String(formData.get("connectionId") ?? "");
  await db
    .update(orgSsoConnections)
    .set({ status: "disabled", updatedAt: new Date() })
    .where(and(eq(orgSsoConnections.tenantId, tenant.id), eq(orgSsoConnections.id, connectionId)));
  revalidatePath("/app/settings/customer-sso");
}
