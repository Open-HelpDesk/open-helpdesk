/**
 * Reads shared by the ee/ desk domains: the resolved configuration, the
 * management chain, department spend, and whether an app is provisioned
 * automatically right now.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  accessGrants,
  deskAppTiers,
  deskConnectors,
  deskSettings,
  people,
  type Tx,
} from "@openhelpdesk/db";
import { deskExtensions, resolveDeskConfig, type ConnectorKind, type DeskConfig } from "@openhelpdesk/desk";

export async function loadDeskConfig(tx: Tx, tenantId: string): Promise<DeskConfig> {
  const [row] = await tx
    .select({ config: deskSettings.config })
    .from(deskSettings)
    .where(eq(deskSettings.tenantId, tenantId))
    .limit(1);
  return resolveDeskConfig(row?.config ?? {});
}

export type ChainPerson = {
  id: string;
  managerId: string | null;
  status: string;
  absentUntil: string | null;
};

export async function loadPerson(tx: Tx, tenantId: string, personId: string): Promise<ChainPerson | null> {
  const [row] = await tx
    .select({ id: people.id, managerId: people.managerId, status: people.status, absentUntil: people.absentUntil })
    .from(people)
    .where(and(eq(people.tenantId, tenantId), eq(people.id, personId)))
    .limit(1);
  return row ?? null;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A departed person approves and reviews nothing; an absent one is skipped past. */
export function canAct(p: ChainPerson, today: string): boolean {
  if (p.status === "departed" || p.status === "suspended") return false;
  if (p.absentUntil && p.absentUntil >= today) return false;
  return true;
}

/**
 * First person able to act among `startId` and its management chain, skipping
 * anyone in `excluded` (the requester, the approvers already in the circuit,
 * the grant holder). Returns the person skipped first when the pick is not
 * `startId` itself (the "on behalf of" of the step), or null.
 */
export async function firstInChain(
  tx: Tx,
  tenantId: string,
  startId: string | null,
  excluded: ReadonlySet<string>,
  now: Date = new Date(),
): Promise<{ personId: string; skippedFrom: string | null } | null> {
  const today = todayIso(now);
  const seen = new Set<string>();
  let current = startId;
  let skippedFrom: string | null = null;
  // Bounded: a management loop in the directory must not hang a request.
  for (let depth = 0; current && depth < 12 && !seen.has(current); depth++) {
    seen.add(current);
    const p = await loadPerson(tx, tenantId, current);
    if (!p) return null;
    if (!excluded.has(p.id) && canAct(p, today)) return { personId: p.id, skippedFrom };
    // Being excluded is not being absent: only record the absent skip.
    if (!excluded.has(p.id) && skippedFrom === null) skippedFrom = p.id;
    current = p.managerId;
  }
  return null;
}

/**
 * Licence spend of a department, in cents per month: every active grant held
 * by a member (departed people included until their grants are revoked — the
 * seat is still paid for) times its tier's monthly cost.
 */
export async function departmentMonthlySpend(tx: Tx, tenantId: string, department: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${deskAppTiers.monthlyCostCents}), 0)::int` })
    .from(accessGrants)
    .innerJoin(people, eq(people.id, accessGrants.personId))
    .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
    .where(
      and(
        eq(accessGrants.tenantId, tenantId),
        isNull(accessGrants.revokedAt),
        eq(people.department, department),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * True when a healthy connector with a registered provisioner covers the app —
 * the only case where "created automatically" may be claimed (spec §4 rule 5).
 * An app with its own outbound SCIM URL and no connector row counts when a
 * `scim` provisioner is registered.
 */
export async function isAutomaticApp(
  tx: Tx,
  tenantId: string,
  app: { connectorId: string | null; scimBaseUrl: string | null },
): Promise<boolean> {
  const ext = deskExtensions();
  if (!ext.provisionerFor) return false;
  let kind: ConnectorKind | null = null;
  if (app.connectorId) {
    const [conn] = await tx
      .select({ kind: deskConnectors.kind, status: deskConnectors.status })
      .from(deskConnectors)
      .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, app.connectorId)))
      .limit(1);
    if (!conn || conn.kind === "manual") return false;
    if (ext.connectorHealthy) {
      if (!(await ext.connectorHealthy(tx, tenantId, app.connectorId))) return false;
    } else if (conn.status !== "connected") {
      return false;
    }
    kind = conn.kind;
  } else if (app.scimBaseUrl) {
    kind = "scim";
  }
  if (!kind) return false;
  return (await ext.provisionerFor(tenantId, kind)) !== null;
}

/** Tier ids a person holds through active grants. */
export async function heldTierIds(tx: Tx, tenantId: string, personId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ tierId: accessGrants.tierId })
    .from(accessGrants)
    .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)));
  return new Set(rows.map((r) => r.tierId));
}

export async function tiersExist(tx: Tx, tenantId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await tx
    .select({ id: deskAppTiers.id })
    .from(deskAppTiers)
    .where(and(eq(deskAppTiers.tenantId, tenantId), inArray(deskAppTiers.id, ids)));
  return new Set(rows.map((r) => r.id)).size === new Set(ids).size;
}
