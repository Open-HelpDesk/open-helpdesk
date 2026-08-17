"use server";

import { revalidatePath } from "next/cache";
import { db, orgSsoConnections, tenants } from "@openhelpdesk/db";
import { and, eq, not } from "drizzle-orm";
import { entitlementsFor } from "@/lib/entitlements";
import { requireManager } from "../guard";

async function requirePro() {
  const current = await requireManager();
  if (!entitlementsFor(current.tenant.plan).customerSso) {
    throw new Error("Le SSO des organisations clientes est réservé au plan Pro.");
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
