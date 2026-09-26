/**
 * SD-A3 — the reads behind the licences screen.
 *
 * Every figure is computed here from desk_apps, their tiers and the active
 * grants, so the tiles and the table can never disagree:
 *
 *  - annual cost of an app = what the assigned seats cost (each grant at its
 *    tier's price) + the purchased seats nobody holds, at the app's dearest
 *    tier — an unassigned seat is still paid for;
 *  - inactive = a grant whose last sign-in is KNOWN and older than the app's
 *    threshold. A grant with no `lastSeenAt` is "unknown", never inactive: the
 *    last sign-in only exists when a connector reports it (spec SD-A3);
 *  - recoverable = what the inactive grants cost, over a year.
 */
import { and, eq, isNull } from "drizzle-orm";
import { accessGrants, deskAppTiers, deskApps, deskConnectors, withTenant } from "@openhelpdesk/db";
import { daysUntil } from "../shared/format";

export type LicenceRow = {
  id: string;
  name: string;
  iconKey: string | null;
  color: string | null;
  assigned: number;
  purchased: number | null;
  /** Grants with a known last sign-in older than the threshold. */
  inactive: number;
  /** Grants whose last sign-in nobody reported. */
  unknown: number;
  inactiveAfterDays: number;
  annualCents: number;
  recoverableCents: number;
  renewsOn: string | null;
  renewsInDays: number | null;
};

export type LicencesData = {
  rows: LicenceRow[];
  /** A connected Entra ID / Google Workspace connector reports sign-ins. */
  activityConnector: boolean;
  totals: {
    annualCents: number;
    assigned: number;
    purchased: number;
    inactive: number;
    unknown: number;
    recoverableCents: number;
    renewalsSoon: number;
    renewalsSoonCents: number;
  };
};

export async function loadLicences(tenantId: string, now: Date = new Date()): Promise<LicencesData> {
  const { apps, tiers, grants, connectors } = await withTenant(tenantId, async (tx) => {
    const apps = await tx
      .select({
        id: deskApps.id,
        name: deskApps.name,
        iconKey: deskApps.iconKey,
        color: deskApps.color,
        seatsPurchased: deskApps.seatsPurchased,
        renewsOn: deskApps.renewsOn,
        inactiveAfterDays: deskApps.inactiveAfterDays,
      })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)));
    const tiers = await tx
      .select({ id: deskAppTiers.id, appId: deskAppTiers.appId, cost: deskAppTiers.monthlyCostCents })
      .from(deskAppTiers)
      .where(eq(deskAppTiers.tenantId, tenantId));
    const grants = await tx
      .select({ appId: accessGrants.appId, tierId: accessGrants.tierId, lastSeenAt: accessGrants.lastSeenAt })
      .from(accessGrants)
      .where(and(eq(accessGrants.tenantId, tenantId), isNull(accessGrants.revokedAt)));
    const connectors = await tx
      .select({ kind: deskConnectors.kind, status: deskConnectors.status })
      .from(deskConnectors)
      .where(eq(deskConnectors.tenantId, tenantId));
    return { apps, tiers, grants, connectors };
  });

  const tierCost = new Map(tiers.map((x) => [x.id, x.cost]));
  const maxCost = new Map<string, number>();
  for (const x of tiers) maxCost.set(x.appId, Math.max(maxCost.get(x.appId) ?? 0, x.cost));

  const rows: LicenceRow[] = [];
  for (const a of apps) {
    const mine = grants.filter((g) => g.appId === a.id);
    const seat = maxCost.get(a.id) ?? 0;
    // "Under contract": a seat count, a renewal date, or a paid tier.
    if (a.seatsPurchased == null && a.renewsOn == null && seat === 0) continue;
    const threshold = now.getTime() - a.inactiveAfterDays * 24 * 3600 * 1000;
    let monthly = 0;
    let inactive = 0;
    let unknown = 0;
    let recoverable = 0;
    for (const g of mine) {
      const cost = tierCost.get(g.tierId) ?? 0;
      monthly += cost;
      if (!g.lastSeenAt) unknown += 1;
      else if (g.lastSeenAt.getTime() < threshold) {
        inactive += 1;
        recoverable += cost * 12;
      }
    }
    const unassigned = a.seatsPurchased != null ? Math.max(0, a.seatsPurchased - mine.length) : 0;
    monthly += unassigned * seat;
    rows.push({
      id: a.id,
      name: a.name,
      iconKey: a.iconKey,
      color: a.color,
      assigned: mine.length,
      purchased: a.seatsPurchased,
      inactive,
      unknown,
      inactiveAfterDays: a.inactiveAfterDays,
      annualCents: monthly * 12,
      recoverableCents: recoverable,
      renewsOn: a.renewsOn,
      renewsInDays: a.renewsOn ? daysUntil(a.renewsOn, now) : null,
    });
  }

  // Sorted by renewal date; no renewal date last, by name.
  rows.sort((x, y) => {
    if (x.renewsInDays == null && y.renewsInDays == null) return x.name.localeCompare(y.name);
    if (x.renewsInDays == null) return 1;
    if (y.renewsInDays == null) return -1;
    return x.renewsInDays - y.renewsInDays;
  });

  const soon = rows.filter((r) => r.renewsInDays != null && r.renewsInDays >= 0 && r.renewsInDays <= 90);
  return {
    rows,
    activityConnector: connectors.some(
      (c) => (c.kind === "entra" || c.kind === "google") && c.status === "connected",
    ),
    totals: {
      annualCents: rows.reduce((s, r) => s + r.annualCents, 0),
      assigned: rows.reduce((s, r) => s + r.assigned, 0),
      // An app with no purchased count holds exactly what is assigned.
      purchased: rows.reduce((s, r) => s + (r.purchased ?? r.assigned), 0),
      inactive: rows.reduce((s, r) => s + r.inactive, 0),
      unknown: rows.reduce((s, r) => s + r.unknown, 0),
      recoverableCents: rows.reduce((s, r) => s + r.recoverableCents, 0),
      renewalsSoon: soon.length,
      renewalsSoonCents: soon.reduce((s, r) => s + r.annualCents, 0),
    },
  };
}
