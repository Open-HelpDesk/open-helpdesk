/**
 * PT-08 (EE) — reads the SSO connection of a customer organization.
 * See ee/LICENSE: this file is not covered by the repository's AGPL.
 */
import { db, orgSsoConnections } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";

/** SSO connection of the organization (at most one). */
export async function getOrgSsoConnection(tenantId: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(orgSsoConnections)
    .where(
      and(
        eq(orgSsoConnections.tenantId, tenantId),
        eq(orgSsoConnections.organizationId, organizationId),
      ),
    );
  return row ?? null;
}
