/**
 * PT-08 (EE) — lecture de la connexion SSO d'une organisation cliente.
 * Voir ee/LICENSE : ce fichier n'est pas couvert par l'AGPL du dépôt.
 */
import { db, orgSsoConnections } from "@openhelpdesk/db";
import { and, eq } from "drizzle-orm";

/** Connexion SSO de l'organisation (au plus une). */
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
