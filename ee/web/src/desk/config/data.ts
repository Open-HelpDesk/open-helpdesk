/**
 * SD-A9 — the reads of the ee/ half of the configuration screen: connectors
 * and their runs, per-app SCIM tokens, separation-of-duties rules, budgets.
 *
 * Plain queries next to the screen (the writes go through @openhelpdesk/ee-desk).
 * Secrets are never decrypted here: the screen only learns whether a connector
 * holds some (the encrypted blob is present), and shows "stored" or "not set".
 */
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql, type AnyColumn } from "drizzle-orm";
import {
  accessGrants,
  deskAppTiers,
  deskApps,
  deskBudgets,
  deskConnectorRuns,
  deskConnectors,
  deskSodRules,
  people,
  withTenant,
} from "@openhelpdesk/db";

export type ConnectorKind = "entra" | "google" | "scim";

export type ConnectorView = {
  id: string;
  kind: ConnectorKind;
  name: string;
  status: "connected" | "error" | "disabled" | "pending";
  settings: Record<string, string>;
  hasSecrets: boolean;
  lastOkAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  apps: number;
};

export type ConnectorRun = { id: string; level: string; message: string; at: string };

export type MappingRow = { appId: string; app: string; iconKey: string | null; color: string | null; tier: string | null; target: string | null };

export type ScimAppToken = { appId: string; app: string; iconKey: string | null; color: string | null; baseUrl: string | null; hasToken: boolean; expiresOn: string | null };

export type ConnectorsData = {
  connectors: ConnectorView[];
  /** Apps with no connector: provisioning is a task for IT. */
  manualApps: MappingRow[];
  runs: Record<string, ConnectorRun[]>;
  mappings: Record<string, MappingRow[]>;
  scimTokens: Record<string, ScimAppToken[]>;
};

function strings(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, x == null ? "" : String(x)]));
}

export async function loadConnectors(tenantId: string): Promise<ConnectorsData> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select().from(deskConnectors).where(eq(deskConnectors.tenantId, tenantId)).orderBy(asc(deskConnectors.createdAt));
    const appCounts = await tx
      .select({ connectorId: deskApps.connectorId, n: count() })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)))
      .groupBy(deskApps.connectorId);
    const countOf = (id: string | null) => appCounts.find((c) => c.connectorId === id)?.n ?? 0;

    const connectors: ConnectorView[] = rows
      .filter((r) => r.kind !== "manual")
      .map((r) => ({
        id: r.id,
        kind: r.kind as ConnectorKind,
        name: r.name,
        status: r.status,
        settings: strings(r.settings),
        hasSecrets: Boolean(r.secrets),
        lastOkAt: r.lastOkAt?.toISOString() ?? null,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        lastError: r.lastError,
        apps: countOf(r.id),
      }));

    const ids = connectors.map((c) => c.id);
    const runs: Record<string, ConnectorRun[]> = {};
    const mappings: Record<string, MappingRow[]> = {};
    const scimTokens: Record<string, ScimAppToken[]> = {};
    if (ids.length) {
      const runRows = await tx
        .select({
          id: deskConnectorRuns.id,
          connectorId: deskConnectorRuns.connectorId,
          level: deskConnectorRuns.level,
          message: deskConnectorRuns.message,
          at: deskConnectorRuns.createdAt,
        })
        .from(deskConnectorRuns)
        .where(and(eq(deskConnectorRuns.tenantId, tenantId), inArray(deskConnectorRuns.connectorId, ids)))
        .orderBy(desc(deskConnectorRuns.createdAt))
        .limit(400);
      for (const r of runRows) {
        const list = (runs[r.connectorId] ??= []);
        if (list.length < 8) list.push({ id: r.id, level: r.level, message: r.message, at: r.at.toISOString() });
      }

      const tierRows = await tx
        .select({
          connectorId: deskApps.connectorId,
          appId: deskApps.id,
          app: deskApps.name,
          iconKey: deskApps.iconKey,
          color: deskApps.color,
          tier: deskAppTiers.name,
          target: deskAppTiers.externalGroup,
        })
        .from(deskApps)
        .leftJoin(deskAppTiers, eq(deskAppTiers.appId, deskApps.id))
        .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt), inArray(deskApps.connectorId, ids)))
        .orderBy(asc(deskApps.name), asc(deskAppTiers.position));
      for (const r of tierRows) {
        if (!r.connectorId) continue;
        (mappings[r.connectorId] ??= []).push({ appId: r.appId, app: r.app, iconKey: r.iconKey, color: r.color, tier: r.tier, target: r.target });
      }

      const scimIds = connectors.filter((c) => c.kind === "scim").map((c) => c.id);
      if (scimIds.length) {
        const tokenRows = await tx
          .select({
            connectorId: deskApps.connectorId,
            appId: deskApps.id,
            app: deskApps.name,
            iconKey: deskApps.iconKey,
            color: deskApps.color,
            baseUrl: deskApps.scimBaseUrl,
            hasToken: sql<boolean>`${deskApps.scimToken} is not null`,
            expiresOn: sql<string | null>`${deskApps.scimTokenExpiresOn}`,
          })
          .from(deskApps)
          .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt), inArray(deskApps.connectorId, scimIds)))
          .orderBy(asc(deskApps.name));
        for (const r of tokenRows) {
          if (!r.connectorId) continue;
          const { connectorId, ...rest } = r;
          (scimTokens[connectorId] ??= []).push(rest);
        }
      }
    }

    // "No connector": apps without one, and apps attached to a `manual` connector row.
    const manualIds = rows.filter((r) => r.kind === "manual").map((r) => r.id);
    const manualApps = await tx
      .select({ appId: deskApps.id, app: deskApps.name, iconKey: deskApps.iconKey, color: deskApps.color })
      .from(deskApps)
      .where(
        and(
          eq(deskApps.tenantId, tenantId),
          isNull(deskApps.deletedAt),
          manualIds.length ? or(isNull(deskApps.connectorId), inArray(deskApps.connectorId, manualIds)) : isNull(deskApps.connectorId),
        ),
      )
      .orderBy(asc(deskApps.name));

    return {
      connectors,
      manualApps: manualApps.map((a) => ({ ...a, tier: null, target: null })),
      runs,
      mappings,
      scimTokens,
    };
  });
}

export type SodRuleView = { id: string; tierAId: string; tierBId: string; a: string; b: string; reason: string; enabled: boolean };

export async function loadSodRules(tenantId: string): Promise<SodRuleView[]> {
  return withTenant(tenantId, async (tx) => {
    const label = (col: AnyColumn) =>
      sql<string>`(select a.name || ' · ' || t.name from app.desk_app_tiers t join app.desk_apps a on a.id = t.app_id where t.id = ${col})`;
    return tx
      .select({
        id: deskSodRules.id,
        tierAId: deskSodRules.tierAId,
        tierBId: deskSodRules.tierBId,
        a: label(deskSodRules.tierAId),
        b: label(deskSodRules.tierBId),
        reason: deskSodRules.reason,
        enabled: deskSodRules.enabled,
      })
      .from(deskSodRules)
      .where(eq(deskSodRules.tenantId, tenantId))
      .orderBy(asc(deskSodRules.createdAt));
  });
}

export type BudgetRow = { department: string; people: number; spendCents: number; budgetCents: number | null };

/**
 * One row per department of the live directory, plus departments that still
 * carry a budget. Spend is MONTHLY (active grants × tier monthly cost); the
 * screen scales it when the budget period is yearly.
 */
export async function loadBudgetRows(tenantId: string): Promise<BudgetRow[]> {
  return withTenant(tenantId, async (tx) => {
    const heads = await tx
      .select({ department: people.department, n: count() })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), ne(people.status, "departed")))
      .groupBy(people.department);
    const spend = await tx
      .select({ department: people.department, cents: sql<number>`coalesce(sum(${deskAppTiers.monthlyCostCents}), 0)`.mapWith(Number) })
      .from(accessGrants)
      .innerJoin(people, eq(people.id, accessGrants.personId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(and(eq(accessGrants.tenantId, tenantId), isNull(accessGrants.revokedAt)))
      .groupBy(people.department);
    const budgets = await tx
      .select({ department: deskBudgets.department, cents: deskBudgets.amountCents })
      .from(deskBudgets)
      .where(eq(deskBudgets.tenantId, tenantId));

    const depts = new Set<string>();
    for (const h of heads) if (h.department) depts.add(h.department);
    for (const b of budgets) depts.add(b.department);
    return [...depts]
      .sort((a, b) => a.localeCompare(b))
      .map((department) => ({
        department,
        people: heads.find((h) => h.department === department)?.n ?? 0,
        spendCents: spend.find((s) => s.department === department)?.cents ?? 0,
        budgetCents: budgets.find((b) => b.department === department)?.cents ?? null,
      }));
  });
}
