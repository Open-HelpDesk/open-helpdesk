/**
 * SD-A9 — the reads of the configuration screen (core half).
 *
 * Writes go through @openhelpdesk/desk (via @/lib/desk); these are plain
 * queries next to the screen, as the contract allows. Every query runs under
 * RLS (`withTenant`) AND filters on the tenant explicitly: the second guard
 * costs nothing and survives a role that bypasses the policies.
 *
 * Returned values are serialisable (dates as ISO strings) so the tabs can hand
 * them straight to client components.
 */
import { and, asc, count, countDistinct, desc, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  accessGrants,
  accessReviews,
  deskAppTiers,
  deskApps,
  deskDelegations,
  deskPackItems,
  deskPacks,
  deskSettings,
  people,
  withTenant,
} from "@openhelpdesk/db";

const today = () => new Date().toISOString().slice(0, 10);

export type DirectorySource = "scim" | "csv" | "entra" | "google" | "manual";

export type DirectoryStatus = {
  source: DirectorySource | null;
  lastSyncAt: string | null;
  people: number;
  departments: number;
  leaving: number;
  withoutManager: number;
  scim: { suffix: string | null; createdAt: string | null };
  /** A preview of the directory as routing sees it — people without a manager first. */
  preview: Array<{
    id: string;
    name: string;
    email: string;
    title: string | null;
    department: string | null;
    manager: string | null;
    startsOn: string | null;
    leavesOn: string | null;
  }>;
};

export async function loadDirectoryStatus(tenantId: string, previewSize = 12): Promise<DirectoryStatus> {
  return withTenant(tenantId, async (tx) => {
    const [settings] = await tx.select().from(deskSettings).where(eq(deskSettings.tenantId, tenantId));
    const live = and(eq(people.tenantId, tenantId), ne(people.status, "departed"));
    const [totals] = await tx
      .select({
        n: count(),
        departments: countDistinct(people.department),
        leaving: sql<number>`count(*) filter (where ${people.leavesOn} >= ${today()})`.mapWith(Number),
        withoutManager: sql<number>`count(*) filter (where ${people.managerId} is null)`.mapWith(Number),
      })
      .from(people)
      .where(live);

    const mgr = alias(people, "mgr");
    const rows = await tx
      .select({
        id: people.id,
        name: people.name,
        email: people.email,
        title: people.title,
        department: people.department,
        manager: mgr.name,
        startsOn: people.startsOn,
        leavesOn: people.leavesOn,
      })
      .from(people)
      .leftJoin(mgr, eq(mgr.id, people.managerId))
      .where(live)
      .orderBy(sql`${people.managerId} is not null`, sql`${people.leavesOn} is null`, asc(people.department), asc(people.name))
      .limit(previewSize);

    // The most recent sync of a person stands in when the settings row has none (CSV imports).
    const [lastPerson] = await tx
      .select({ at: people.lastSyncedAt })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), isNotNull(people.lastSyncedAt)))
      .orderBy(desc(people.lastSyncedAt))
      .limit(1);
    const lastSync = settings?.lastDirectorySyncAt ?? lastPerson?.at ?? null;

    const [firstSource] = settings?.directorySource
      ? [{ source: settings.directorySource }]
      : await tx
          .select({ source: people.source, n: count() })
          .from(people)
          .where(eq(people.tenantId, tenantId))
          .groupBy(people.source)
          .orderBy(desc(count()))
          .limit(1);

    return {
      source: (firstSource?.source as DirectorySource | undefined) ?? null,
      lastSyncAt: lastSync ? lastSync.toISOString() : null,
      people: totals?.n ?? 0,
      departments: totals?.departments ?? 0,
      leaving: totals?.leaving ?? 0,
      withoutManager: totals?.withoutManager ?? 0,
      scim: {
        suffix: settings?.scimTokenSuffix ?? null,
        createdAt: settings?.scimTokenCreatedAt ? settings.scimTokenCreatedAt.toISOString() : null,
      },
      preview: rows,
    };
  });
}

export type PersonOption = { id: string; name: string; department: string | null };

/** Everyone who can approve or receive a delegation: the live directory. */
export async function loadPeopleOptions(tenantId: string): Promise<PersonOption[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({ id: people.id, name: people.name, department: people.department })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), ne(people.status, "departed")))
      .orderBy(asc(people.name)),
  );
}

export type DelegationRow = { id: string; from: string; to: string; startsOn: string; endsOn: string; current: boolean };

/** Delegations still running or to come — past ones are history, in the journal. */
export async function loadDelegations(tenantId: string): Promise<DelegationRow[]> {
  const d = today();
  return withTenant(tenantId, async (tx) => {
    const pFrom = alias(people, "p_from");
    const pTo = alias(people, "p_to");
    const rows = await tx
      .select({
        id: deskDelegations.id,
        from: pFrom.name,
        to: pTo.name,
        startsOn: deskDelegations.startsOn,
        endsOn: deskDelegations.endsOn,
      })
      .from(deskDelegations)
      .innerJoin(pFrom, eq(pFrom.id, deskDelegations.fromPersonId))
      .innerJoin(pTo, eq(pTo.id, deskDelegations.toPersonId))
      .where(and(eq(deskDelegations.tenantId, tenantId), gte(deskDelegations.endsOn, d)))
      .orderBy(asc(deskDelegations.startsOn));
    return rows.map((r) => ({ ...r, current: r.startsOn <= d }));
  });
}

export type TemporaryGrant = {
  id: string;
  person: string;
  app: string;
  iconKey: string | null;
  color: string | null;
  tier: string;
  expiresOn: string;
};

export async function loadTemporaryGrants(tenantId: string, limit = 50): Promise<TemporaryGrant[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: accessGrants.id,
        person: people.name,
        app: deskApps.name,
        iconKey: deskApps.iconKey,
        color: deskApps.color,
        tier: deskAppTiers.name,
        expiresOn: sql<string>`${accessGrants.expiresOn}`,
      })
      .from(accessGrants)
      .innerJoin(people, eq(people.id, accessGrants.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(and(eq(accessGrants.tenantId, tenantId), isNull(accessGrants.revokedAt), isNotNull(accessGrants.expiresOn)))
      .orderBy(asc(accessGrants.expiresOn))
      .limit(limit),
  );
}

export type TierOption = { id: string; app: string; tier: string; privileged: boolean };

/** Every licence tier of the live catalogue, "App · Tier" — for privileged roles and SoD rules. */
export async function loadTiers(tenantId: string): Promise<TierOption[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({ id: deskAppTiers.id, app: deskApps.name, tier: deskAppTiers.name, privileged: deskAppTiers.privileged })
      .from(deskAppTiers)
      .innerJoin(deskApps, eq(deskApps.id, deskAppTiers.appId))
      .where(and(eq(deskAppTiers.tenantId, tenantId), isNull(deskApps.deletedAt)))
      .orderBy(asc(deskApps.name), asc(deskAppTiers.position)),
  );
}

export type CatalogueCounts = { apps: number; sensitive: number; privilegedTiers: number };

/** The numbers behind the review scope note. */
export async function loadCatalogueCounts(tenantId: string): Promise<CatalogueCounts> {
  return withTenant(tenantId, async (tx) => {
    const [a] = await tx
      .select({
        apps: count(),
        sensitive: sql<number>`count(*) filter (where ${deskApps.approvalLevels} = 2)`.mapWith(Number),
      })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)));
    const [p] = await tx
      .select({ n: count() })
      .from(deskAppTiers)
      .innerJoin(deskApps, eq(deskApps.id, deskAppTiers.appId))
      .where(and(eq(deskAppTiers.tenantId, tenantId), eq(deskAppTiers.privileged, true), isNull(deskApps.deletedAt)));
    return { apps: a?.apps ?? 0, sensitive: a?.sensitive ?? 0, privilegedTiers: p?.n ?? 0 };
  });
}

/** The last campaign opened, to say when the next one is due. */
export async function loadLastReview(tenantId: string): Promise<{ name: string; opensOn: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({ name: accessReviews.name, opensOn: sql<string>`${accessReviews.opensOn}` })
      .from(accessReviews)
      .where(eq(accessReviews.tenantId, tenantId))
      .orderBy(desc(accessReviews.opensOn))
      .limit(1);
    return r ?? null;
  });
}

export type PackRow = { department: string; apps: string[] };

export async function loadPacks(tenantId: string): Promise<PackRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ department: deskPacks.department, app: deskApps.name })
      .from(deskPacks)
      .leftJoin(deskPackItems, eq(deskPackItems.packId, deskPacks.id))
      .leftJoin(deskApps, and(eq(deskApps.id, deskPackItems.appId), isNull(deskApps.deletedAt)))
      .where(eq(deskPacks.tenantId, tenantId))
      .orderBy(asc(deskPacks.department), asc(deskApps.name));
    const byDept = new Map<string, string[]>();
    for (const r of rows) {
      const list = byDept.get(r.department) ?? [];
      if (r.app) list.push(r.app);
      byDept.set(r.department, list);
    }
    return [...byDept].map(([department, apps]) => ({ department, apps }));
  });
}
