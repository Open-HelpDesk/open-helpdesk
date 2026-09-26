/**
 * Loads what the pure circuit needs, runs it, then merges the ee/ extension.
 * Shared by the preview (drawer of SD-E1) and the submission, which never
 * trusts what the client previewed.
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  deskAppAutoGroups,
  deskApps,
  deskAppTiers,
  deskConnectors,
  deskDelegations,
  people,
  peopleGroupMembers,
  type Tx,
} from "@openhelpdesk/db";
import { computeCoreCircuit, type CircuitPerson } from "./circuit";
import type { DeskConfig } from "./config";
import { DeskNotFoundError, DeskValidationError } from "./errors";
import { deskExtensions } from "./extensions";
import { dateIn, loadConfig, tenantInfo, type TenantInfo } from "./internal";
import type { CircuitPreview, ConnectorKind } from "./types";

export type AppRow = typeof deskApps.$inferSelect;
export type TierRow = typeof deskAppTiers.$inferSelect;
export type PersonRow = typeof people.$inferSelect;

export type LoadedCircuit = {
  preview: CircuitPreview;
  app: AppRow;
  tier: TierRow;
  person: PersonRow;
  config: DeskConfig;
  tenant: TenantInfo;
  today: string;
  connectorId: string | null;
};

export async function loadApp(tx: Tx, tenantId: string, appId: string, opts: { includeArchived?: boolean } = {}): Promise<AppRow> {
  const [app] = await tx
    .select()
    .from(deskApps)
    .where(and(eq(deskApps.tenantId, tenantId), eq(deskApps.id, appId), opts.includeArchived ? undefined : isNull(deskApps.deletedAt)));
  if (!app) throw new DeskNotFoundError("app");
  return app;
}

export async function loadPerson(tx: Tx, tenantId: string, personId: string): Promise<PersonRow> {
  const [p] = await tx.select().from(people).where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
  if (!p) throw new DeskNotFoundError("person");
  return p;
}

export async function loadTier(tx: Tx, tenantId: string, appId: string, tierId: string): Promise<TierRow> {
  const [tier] = await tx.select().from(deskAppTiers).where(and(eq(deskAppTiers.tenantId, tenantId), eq(deskAppTiers.id, tierId)));
  if (!tier) throw new DeskNotFoundError("tier");
  if (tier.appId !== appId) throw new DeskValidationError("tier_mismatch");
  return tier;
}

/**
 * How the account of this app is created, and whether that is automatic —
 * doctrine rule 5: "automatic" is only claimed when a connector is attached,
 * is not manual, is healthy right now AND a provisioner exists for it.
 */
export async function provisioningModeFor(
  tx: Tx,
  tenantId: string,
  app: Pick<AppRow, "connectorId">,
): Promise<{ kind: ConnectorKind; automatic: boolean; connectorId: string | null }> {
  if (!app.connectorId) return { kind: "manual", automatic: false, connectorId: null };
  const [connector] = await tx
    .select({ id: deskConnectors.id, kind: deskConnectors.kind })
    .from(deskConnectors)
    .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, app.connectorId)));
  if (!connector) return { kind: "manual", automatic: false, connectorId: null };
  if (connector.kind === "manual") return { kind: "manual", automatic: false, connectorId: connector.id };
  const ext = deskExtensions();
  const healthy = ext.connectorHealthy ? await ext.connectorHealthy(tx, tenantId, connector.id) : false;
  const provisioner = healthy && ext.provisionerFor ? await ext.provisionerFor(tenantId, connector.kind) : null;
  return { kind: connector.kind, automatic: healthy && provisioner !== null, connectorId: connector.id };
}

function toCircuitPerson(p: Pick<PersonRow, "id" | "managerId" | "absentUntil" | "status">): CircuitPerson {
  return { id: p.id, managerId: p.managerId, absentUntil: p.absentUntil, status: p.status };
}

export async function loadCircuit(
  tx: Tx,
  tenantId: string,
  personId: string,
  appId: string,
  tierId: string,
  opts: { minLevels?: number } = {},
): Promise<LoadedCircuit> {
  const [tenant, config, app, person] = await Promise.all([
    tenantInfo(tx, tenantId),
    loadConfig(tx, tenantId),
    loadApp(tx, tenantId, appId),
    loadPerson(tx, tenantId, personId),
  ]);
  const tier = await loadTier(tx, tenantId, appId, tierId);
  const today = dateIn(tenant.timezone);

  const [autoGroups, memberships, everyone, delegations] = await Promise.all([
    tx.select({ groupId: deskAppAutoGroups.groupId }).from(deskAppAutoGroups).where(and(eq(deskAppAutoGroups.tenantId, tenantId), eq(deskAppAutoGroups.appId, appId))),
    tx.select({ groupId: peopleGroupMembers.groupId }).from(peopleGroupMembers).where(and(eq(peopleGroupMembers.tenantId, tenantId), eq(peopleGroupMembers.personId, personId))),
    // The org chart is small (hundreds of rows): walking it in memory beats a recursive query.
    tx
      .select({ id: people.id, managerId: people.managerId, absentUntil: people.absentUntil, status: people.status })
      .from(people)
      .where(eq(people.tenantId, tenantId)),
    tx
      .select({ from: deskDelegations.fromPersonId, to: deskDelegations.toPersonId, createdAt: deskDelegations.createdAt })
      .from(deskDelegations)
      .where(and(eq(deskDelegations.tenantId, tenantId), lte(deskDelegations.startsOn, today), gte(deskDelegations.endsOn, today))),
  ]);

  const map = new Map<string, CircuitPerson>(everyone.map((p) => [p.id, toCircuitPerson(p)]));
  const delegationMap = new Map<string, string>();
  for (const d of [...delegations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) delegationMap.set(d.from, d.to);

  const core = computeCoreCircuit({
    requester: toCircuitPerson(person),
    app: { ownerPersonId: app.ownerPersonId, approvalLevels: app.approvalLevels, maxDurationDays: app.maxDurationDays },
    autoGroupIds: autoGroups.map((g) => g.groupId).sort(),
    requesterGroupIds: memberships.map((m) => m.groupId),
    people: map,
    delegations: delegationMap,
    whenAbsent: config.approvals.whenAbsent,
    today,
    minLevels: opts.minLevels,
  });

  const mode = await provisioningModeFor(tx, tenantId, app);
  let steps = core.steps;
  let blocked = core.blocked;
  let budget: CircuitPreview["budget"] = null;
  let sodConflict: CircuitPreview["sodConflict"] = null;
  const ext = deskExtensions();
  if (ext.extendCircuit) {
    const extra = await ext.extendCircuit({
      tx,
      tenantId,
      config,
      person: { id: person.id, department: person.department, managerId: person.managerId },
      app: { id: app.id, ownerPersonId: app.ownerPersonId, approvalLevels: app.approvalLevels },
      tier: { id: tier.id, privileged: tier.privileged, monthlyCostCents: tier.monthlyCostCents },
      steps: core.steps,
    });
    // Rule 3 holds for extension steps too: the requester never approves.
    steps = [...steps, ...extra.extraSteps.filter((st) => st.approverPersonId !== person.id)];
    budget = extra.budget;
    sodConflict = extra.sodConflict;
    blocked = blocked ?? extra.blocked;
    if (!blocked && extra.extraSteps.some((st) => !st.approverPersonId)) blocked = "no_approver";
  }

  const effectiveLevels = steps.length;
  return {
    preview: {
      effectiveLevels,
      autoRule: effectiveLevels === 0 ? core.autoRule : null,
      steps,
      provisioning: { kind: mode.kind, automatic: mode.automatic },
      budget,
      sodConflict,
      blocked,
      durations: core.durations,
      justificationRequired: effectiveLevels > 0,
    },
    app,
    tier,
    person,
    config,
    tenant,
    today,
    connectorId: mode.connectorId,
  };
}

/** Names of people, for journal lines and emails. */
export async function namesOf(tx: Tx, tenantId: string, ids: Array<string | null | undefined>): Promise<Map<string, { name: string; email: string; contactId: string }>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return new Map();
  const rows = await tx
    .select({ id: people.id, name: people.name, email: people.email, contactId: people.contactId })
    .from(people)
    .where(and(eq(people.tenantId, tenantId), inArray(people.id, list)));
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email, contactId: r.contactId }]));
}
