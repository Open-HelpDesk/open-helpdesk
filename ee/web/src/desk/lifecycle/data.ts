/**
 * SD-A6 — the reads behind the joiners and leavers screen.
 *
 * Departure: until an offboarding is scheduled the checklist is a PREVIEW
 * computed from what the person holds (grants, hardware) plus the transfers
 * the configuration implies; once scheduled, the plan's own tasks are shown
 * and can be ticked. The two share their task keys (`revoke:<appId>`,
 * `transfer:drive`, `hardware:<id>`…) so the screen reads the same.
 *
 * Arrival: packs per department, the visible catalogue with its real
 * provisioning mode (automatic only behind a connected connector), and the
 * hardware in stock grouped by model.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  accessGrants,
  deskAppTiers,
  deskApps,
  deskConnectors,
  deskPackItems,
  deskPacks,
  hardwareAssets,
  lifecyclePlans,
  lifecycleTasks,
  people,
  withTenant,
} from "@openhelpdesk/db";
import { isoDay, provisioningOf, type ProvisioningKind } from "../shared/format";

export type PersonLite = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  startsOn: string | null;
  leavesOn: string | null;
  status: string;
};

export type OffTask = {
  /** null in the preview: nothing to tick until the plan exists. */
  id: string | null;
  kind: "revoke" | "transfer" | "hardware" | "grant";
  key: string;
  done: boolean;
  automatic: boolean;
  app?: { name: string; iconKey: string | null; color: string | null; tier: string; provisioning: ProvisioningKind; degraded: boolean };
  hardware?: { model: string; tag: string };
  detail: Record<string, unknown>;
};

export type Offboarding = {
  person: PersonLite & { managerName: string | null };
  plan: { id: string; executeAt: string; state: string } | null;
  tasks: OffTask[];
  monthlyFreedCents: number;
  autoRevocations: number;
  totalRevocations: number;
  devices: number;
};

export type CatalogueApp = {
  id: string;
  name: string;
  iconKey: string | null;
  color: string | null;
  provisioning: ProvisioningKind;
  automatic: boolean;
  monthlyCents: number;
};

export type LifecycleData = {
  leavers: PersonLite[];
  others: PersonLite[];
  offboarding: Offboarding | null;
  joiners: PersonLite[];
  scheduledOnboardings: Array<{ personId: string; name: string; executeAt: string }>;
  managers: PersonLite[];
  departments: string[];
  packs: Record<string, string[]>;
  apps: CatalogueApp[];
  stock: Array<{ model: string; type: string; count: number }>;
};

export async function loadLifecycle(tenantId: string, personParam: string | undefined, now = new Date()): Promise<LifecycleData> {
  const today = isoDay(0, now);
  return withTenant(tenantId, async (tx) => {
    const everyone = await tx
      .select({
        id: people.id,
        name: people.name,
        email: people.email,
        title: people.title,
        department: people.department,
        startsOn: people.startsOn,
        leavesOn: people.leavesOn,
        status: people.status,
        managerId: people.managerId,
      })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), inArray(people.status, ["active", "leaving", "suspended"])))
      .orderBy(asc(people.name));

    const leavers = everyone
      .filter((p) => p.leavesOn && p.leavesOn >= today)
      .sort((a, b) => (a.leavesOn! < b.leavesOn! ? -1 : a.leavesOn! > b.leavesOn! ? 1 : 0));
    const others = everyone.filter((p) => !leavers.includes(p));

    const plans = await tx
      .select({ id: lifecyclePlans.id, personId: lifecyclePlans.personId, kind: lifecyclePlans.kind, executeAt: lifecyclePlans.executeAt, state: lifecyclePlans.state })
      .from(lifecyclePlans)
      .where(and(eq(lifecyclePlans.tenantId, tenantId), inArray(lifecyclePlans.state, ["scheduled", "running"])));

    /* ---------- Catalogue (shared by both tabs) ---------- */
    const appRows = await tx
      .select({
        id: deskApps.id,
        name: deskApps.name,
        iconKey: deskApps.iconKey,
        color: deskApps.color,
        visible: deskApps.visible,
        scimBaseUrl: deskApps.scimBaseUrl,
        scimToken: deskApps.scimToken,
        connectorKind: deskConnectors.kind,
        connectorStatus: deskConnectors.status,
      })
      .from(deskApps)
      .leftJoin(deskConnectors, eq(deskConnectors.id, deskApps.connectorId))
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)))
      .orderBy(asc(deskApps.name));
    const tiers = await tx
      .select({ id: deskAppTiers.id, appId: deskAppTiers.appId, name: deskAppTiers.name, cost: deskAppTiers.monthlyCostCents, position: deskAppTiers.position })
      .from(deskAppTiers)
      .where(eq(deskAppTiers.tenantId, tenantId))
      .orderBy(asc(deskAppTiers.position));
    const firstTier = new Map<string, number>();
    for (const x of tiers) if (!firstTier.has(x.appId)) firstTier.set(x.appId, x.cost);
    const provOf = new Map(
      appRows.map((a) => [
        a.id,
        provisioningOf({ connectorKind: a.connectorKind, connectorStatus: a.connectorStatus, scimBaseUrl: a.scimBaseUrl, hasScimToken: Boolean(a.scimToken) }),
      ]),
    );

    /* ---------- Departure ---------- */
    const target = everyone.find((p) => p.id === personParam) ?? leavers[0] ?? null;
    let offboarding: Offboarding | null = null;
    if (target) {
      const manager = target.managerId ? everyone.find((p) => p.id === target.managerId) : null;
      const plan = plans.find((p) => p.personId === target.id && p.kind === "offboarding") ?? null;
      const grants = await tx
        .select({ id: accessGrants.id, appId: accessGrants.appId, tierId: accessGrants.tierId })
        .from(accessGrants)
        .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, target.id), isNull(accessGrants.revokedAt)));
      const devices = await tx
        .select({ id: hardwareAssets.id, model: hardwareAssets.model, tag: hardwareAssets.tag })
        .from(hardwareAssets)
        .where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.assignedPersonId, target.id)));
      const tierById = new Map(tiers.map((x) => [x.id, x]));
      const appById = new Map(appRows.map((a) => [a.id, a]));
      const appInfo = (appId: string | null, tierId: string | null) => {
        const a = appId ? appById.get(appId) : undefined;
        if (!a) return undefined;
        const p = provOf.get(a.id)!;
        return { name: a.name, iconKey: a.iconKey, color: a.color, tier: (tierId && tierById.get(tierId)?.name) || "", provisioning: p.kind, degraded: p.degraded };
      };

      let tasks: OffTask[];
      if (plan) {
        const rows = await tx
          .select()
          .from(lifecycleTasks)
          .where(and(eq(lifecycleTasks.tenantId, tenantId), eq(lifecycleTasks.planId, plan.id)))
          .orderBy(asc(lifecycleTasks.position));
        const hwById = new Map(devices.map((d) => [d.id, d]));
        tasks = rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          key: r.key,
          done: r.done,
          automatic: r.automatic,
          app: appInfo(r.appId, r.tierId),
          hardware: r.hardwareId && hwById.get(r.hardwareId) ? { model: hwById.get(r.hardwareId)!.model, tag: hwById.get(r.hardwareId)!.tag } : readHardware(r.detail),
          detail: (r.detail ?? {}) as Record<string, unknown>,
        }));
      } else {
        tasks = [
          ...grants.map<OffTask>((g) => ({
            id: null,
            kind: "revoke",
            key: `revoke:${g.appId}`,
            done: false,
            automatic: provOf.get(g.appId)?.automatic ?? false,
            app: appInfo(g.appId, g.tierId),
            detail: {},
          })),
          ...["transfer:drive", "transfer:mail", "transfer:idp"].map<OffTask>((key) => ({
            id: null,
            kind: "transfer",
            key,
            done: false,
            automatic: false,
            detail: {},
          })),
          ...devices.map<OffTask>((d) => ({
            id: null,
            kind: "hardware",
            key: `hardware:${d.id}`,
            done: false,
            automatic: false,
            hardware: { model: d.model, tag: d.tag },
            detail: {},
          })),
        ];
      }
      const revocations = tasks.filter((x) => x.kind === "revoke");
      offboarding = {
        person: { ...target, managerName: manager?.name ?? null },
        plan: plan ? { id: plan.id, executeAt: plan.executeAt.toISOString(), state: plan.state } : null,
        tasks,
        monthlyFreedCents: grants.reduce((s, g) => s + (tierById.get(g.tierId)?.cost ?? 0), 0),
        autoRevocations: revocations.filter((x) => x.automatic).length,
        totalRevocations: revocations.length,
        devices: tasks.filter((x) => x.kind === "hardware").length,
      };
    }

    /* ---------- Arrival ---------- */
    const onboardingPlans = plans.filter((p) => p.kind === "onboarding");
    const scheduledIds = new Set(onboardingPlans.map((p) => p.personId));
    const joiners = everyone.filter((p) => p.startsOn && p.startsOn >= today && !scheduledIds.has(p.id));

    const packRows = await tx
      .select({ department: deskPacks.department, appId: deskPackItems.appId })
      .from(deskPacks)
      .leftJoin(deskPackItems, eq(deskPackItems.packId, deskPacks.id))
      .where(eq(deskPacks.tenantId, tenantId));
    const packs: Record<string, string[]> = {};
    for (const r of packRows) {
      packs[r.department] ??= [];
      if (r.appId) packs[r.department]!.push(r.appId);
    }
    const departments = [
      ...new Set([...Object.keys(packs), ...everyone.map((p) => p.department).filter((d): d is string => Boolean(d))]),
    ].sort((a, b) => a.localeCompare(b));

    const stockRows = await tx
      .select({ model: hardwareAssets.model, type: hardwareAssets.type })
      .from(hardwareAssets)
      .where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.status, "in_stock")));
    const stockMap = new Map<string, { model: string; type: string; count: number }>();
    for (const s of stockRows) {
      const cur = stockMap.get(s.model) ?? { model: s.model, type: s.type, count: 0 };
      cur.count += 1;
      stockMap.set(s.model, cur);
    }

    const lite = ({ managerId: _m, ...p }: (typeof everyone)[number]): PersonLite => p;
    const managerIds = new Set(everyone.map((p) => p.managerId).filter(Boolean));
    return {
      leavers: leavers.map(lite),
      others: others.map(lite),
      offboarding,
      joiners: joiners.map(lite),
      scheduledOnboardings: onboardingPlans
        .map((p) => {
          const who = everyone.find((x) => x.id === p.personId);
          // The first day is what people plan around; the run itself happens a few days earlier.
          return { personId: p.personId, name: who?.name ?? "", executeAt: who?.startsOn ?? p.executeAt.toISOString() };
        })
        .sort((a, b) => a.executeAt.localeCompare(b.executeAt)),
      // Managers first (people someone reports to), then everyone else.
      managers: [...everyone.filter((p) => managerIds.has(p.id)), ...everyone.filter((p) => !managerIds.has(p.id))].map(lite),
      departments,
      packs,
      apps: appRows
        .filter((a) => a.visible)
        .map((a) => {
          const p = provOf.get(a.id)!;
          return { id: a.id, name: a.name, iconKey: a.iconKey, color: a.color, provisioning: p.kind, automatic: p.automatic, monthlyCents: firstTier.get(a.id) ?? 0 };
        }),
      stock: [...stockMap.values()].sort((a, b) => a.type.localeCompare(b.type) || a.model.localeCompare(b.model)),
    };
  });
}

function readHardware(detail: unknown): { model: string; tag: string } | undefined {
  const d = (detail ?? {}) as Record<string, unknown>;
  return typeof d.model === "string" ? { model: d.model, tag: typeof d.tag === "string" ? d.tag : "" } : undefined;
}
