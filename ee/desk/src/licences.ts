import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { accessGrants, deskAppTiers, deskApps, withTenant } from "@openhelpdesk/db";
import { revokeAccess, type Actor } from "@openhelpdesk/desk";
import { DeskEeError, requireEntitlement } from "./gov/entitlements";
import { journal } from "./gov/audit";

export { DeskEeEntitlementError, DeskEeError } from "./gov/entitlements";

/* ---------------- Licences (deskLicences) ---------------- */

const DAY = 86_400_000;

/**
 * "Libérer les inactifs": revokes grants inactive past the app's threshold.
 * Unknown lastSeen is never inactive — a null `lastSeenAt` means no connector
 * reports sign-ins, not that nobody signs in.
 */
export async function reclaimInactiveSeats(tenantId: string, appId: string, actor: Actor): Promise<{ revoked: number; yearlySavingCents: number }> {
  const { app, candidates } = await withTenant(tenantId, async (tx) => {
    await requireEntitlement(tx, tenantId, "deskLicences");
    const [app] = await tx
      .select({ id: deskApps.id, name: deskApps.name, inactiveAfterDays: deskApps.inactiveAfterDays })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), eq(deskApps.id, appId)))
      .limit(1);
    if (!app) throw new DeskEeError("app_not_found", "Unknown application");
    const cutoff = new Date(Date.now() - app.inactiveAfterDays * DAY);
    const candidates = await tx
      .select({ id: accessGrants.id, monthlyCostCents: deskAppTiers.monthlyCostCents })
      .from(accessGrants)
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(
        and(
          eq(accessGrants.tenantId, tenantId),
          eq(accessGrants.appId, appId),
          isNull(accessGrants.revokedAt),
          isNotNull(accessGrants.lastSeenAt),
          lt(accessGrants.lastSeenAt, cutoff),
        ),
      );
    return { app, candidates };
  });

  // Each revocation goes through the core, which journals it and queues the
  // connector (or the IT task) — outside our transaction, it opens its own.
  const reason = `inactive seat: no sign-in for ${app.inactiveAfterDays} days`;
  let revoked = 0;
  let yearlySavingCents = 0;
  const revokedIds: string[] = [];
  for (const g of candidates) {
    await revokeAccess(tenantId, g.id, reason, actor);
    revoked++;
    yearlySavingCents += g.monthlyCostCents * 12;
    revokedIds.push(g.id);
  }

  await withTenant(tenantId, (tx) =>
    journal(tx, tenantId, actor, "desk.licences.reclaimed", { type: "desk_app", id: app.id }, {
      after: { app: app.name, revoked, yearlySavingCents, inactiveAfterDays: app.inactiveAfterDays, grantIds: revokedIds },
    }),
  );
  return { revoked, yearlySavingCents };
}
