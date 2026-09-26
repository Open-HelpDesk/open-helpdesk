/**
 * Reads behind the employee portal (spec 19 — SD-E1, SD-E2, SD-M1, SD-M2).
 *
 * Writes never happen here: they go through the desk API (`@/lib/desk`), which
 * owns the audit trail. Every function runs inside `withTenant` (row level
 * security) and returns plain serialisable data — ISO strings, no Date — that
 * server components hand to client components as-is.
 *
 * The catalogue badge ("Accès immédiat / 1 approbation / 2 approbations") is
 * computed here with the core's rules — level 0, auto-approval groups, the
 * manager-who-is-also-the-owner merge — because calling `previewCircuit` for
 * every card would cost one circuit computation per application. The drawer,
 * which is what the employee acts on, always shows the real preview.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import {
  accessApprovals,
  accessGrants,
  accessRequests,
  attachments,
  db,
  deskAppAutoGroups,
  deskApps,
  deskAppTiers,
  deskConnectors,
  deskDelegations,
  hardwareAssets,
  people,
  peopleGroupMembers,
  peopleGroups,
  tenants,
  tickets,
  withTenant,
  type Tx,
} from "@openhelpdesk/db";
import { getDeskConfig, type DeskConfig } from "@/lib/desk";

export type RequestState =
  | "awaiting_manager"
  | "awaiting_owner"
  | "awaiting_extra"
  | "provisioning"
  | "active"
  | "refused"
  | "cancelled"
  | "provisioning_failed";

export type StepName = "manager" | "owner" | "privileged" | "finance";
export type ConnectorKindName = "entra" | "google" | "scim" | "manual";

/** Requests still moving — they block a second request for the same app. */
export const OPEN_STATES: RequestState[] = [
  "awaiting_manager",
  "awaiting_owner",
  "awaiting_extra",
  "provisioning",
  "provisioning_failed",
];
const AWAITING: RequestState[] = ["awaiting_manager", "awaiting_owner", "awaiting_extra"];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/**
 * Uploaded logos go through the portal's own read route: `/api/attachments`
 * only serves agents and the contact of a ticket, so an employee could not
 * load them. The attachment id rides along as a version, so a new logo is a
 * new URL and the route can let browsers cache the old one.
 */
const logoUrlOf = (appId: string, attachmentId: string | null) =>
  attachmentId ? `/desk/logo/${appId}?v=${attachmentId}` : null;

/* ---------- The signed-in employee ---------- */

export type PortalPerson = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  managerId: string | null;
  managerName: string | null;
  startsOn: string | null;
  /** Direct reports (active people only). */
  reportCount: number;
  /** Approvals waiting for this person right now (any step). */
  pendingApprovals: number;
  /** Decisions already taken — keeps the history tab reachable. */
  decisionCount: number;
  /** Open requests of this person — the count on "My access". */
  openRequests: number;
};

export async function portalPerson(tenantId: string, personId: string): Promise<PortalPerson | null> {
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx.select().from(people).where(eq(people.id, personId));
    if (!p) return null;
    const manager = p.managerId
      ? (await tx.select({ name: people.name }).from(people).where(eq(people.id, p.managerId)))[0]
      : undefined;
    const [reports] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(people)
      .where(and(eq(people.managerId, p.id), ne(people.status, "departed")));
    const pending = await currentApprovalIds(tx, p.id);
    const [decisions] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accessApprovals)
      .where(
        and(
          eq(accessApprovals.approverPersonId, p.id),
          inArray(accessApprovals.decision, ["approved", "refused"]),
        ),
      );
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(accessRequests)
      .where(and(eq(accessRequests.personId, p.id), inArray(accessRequests.state, OPEN_STATES)));
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      department: p.department,
      managerId: p.managerId,
      managerName: manager?.name ?? null,
      startsOn: p.startsOn,
      reportCount: reports?.n ?? 0,
      pendingApprovals: pending.length,
      decisionCount: decisions?.n ?? 0,
      openRequests: open?.n ?? 0,
    };
  });
}

/**
 * The approvals this person can act on now: pending, assigned to them, on a
 * request still awaiting approval, and the FIRST pending step of that request
 * — a later step is not theirs to decide yet.
 */
async function currentApprovalIds(tx: Tx, personId: string): Promise<string[]> {
  const mine = await tx
    .select({ id: accessApprovals.id, requestId: accessApprovals.requestId, position: accessApprovals.position })
    .from(accessApprovals)
    .innerJoin(accessRequests, eq(accessRequests.id, accessApprovals.requestId))
    .where(
      and(
        eq(accessApprovals.approverPersonId, personId),
        eq(accessApprovals.decision, "pending"),
        inArray(accessRequests.state, AWAITING),
      ),
    );
  if (mine.length === 0) return [];
  const requestIds = [...new Set(mine.map((m) => m.requestId))];
  const firsts = await tx
    .select({
      requestId: accessApprovals.requestId,
      position: sql<number>`min(${accessApprovals.position})::int`,
    })
    .from(accessApprovals)
    .where(and(inArray(accessApprovals.requestId, requestIds), eq(accessApprovals.decision, "pending")))
    .groupBy(accessApprovals.requestId);
  const first = new Map(firsts.map((f) => [f.requestId, f.position]));
  return mine.filter((m) => first.get(m.requestId) === m.position).map((m) => m.id);
}

/** Connector kind that will really create the account — manual when none is healthy. */
function effectiveKind(c: { kind: ConnectorKindName; status: string } | null | undefined): ConnectorKindName {
  return c && c.status === "connected" ? c.kind : "manual";
}

/* ---------- SD-E1 — catalogue ---------- */

export type CatalogueTier = { id: string; name: string; monthlyCostCents: number; privileged: boolean };

export type CatalogueApp = {
  id: string;
  name: string;
  category: string;
  description: string;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
  ownerName: string | null;
  tiers: CatalogueTier[];
  /** Badge: 0 immediate, 1 or 2 approvals. */
  levels: number;
  /** The person already holds it. */
  held: boolean;
  /** An open request exists for it. */
  pending: boolean;
};

export async function portalCatalogue(tenantId: string, personId: string): Promise<CatalogueApp[]> {
  return withTenant(tenantId, async (tx) => {
    const [me] = await tx
      .select({ id: people.id, managerId: people.managerId, department: people.department })
      .from(people)
      .where(eq(people.id, personId));
    if (!me) return [];
    const apps = await tx
      .select()
      .from(deskApps)
      .where(and(eq(deskApps.visible, true), isNull(deskApps.deletedAt)))
      .orderBy(asc(deskApps.name));
    if (apps.length === 0) return [];
    const appIds = apps.map((a) => a.id);
    const tiers = await tx
      .select()
      .from(deskAppTiers)
      .where(inArray(deskAppTiers.appId, appIds))
      .orderBy(asc(deskAppTiers.position), asc(deskAppTiers.monthlyCostCents));
    const ownerIds = [...new Set(apps.map((a) => a.ownerPersonId).filter((x): x is string => !!x))];
    const owners = ownerIds.length
      ? await tx.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, ownerIds))
      : [];
    const ownerName = new Map(owners.map((o) => [o.id, o.name]));

    // Auto-approval groups: explicit membership, plus the computed groups read
    // from the directory itself in case their sync lags behind.
    const autoRows = await tx
      .select({ appId: deskAppAutoGroups.appId, groupId: peopleGroups.id, kind: peopleGroups.kind })
      .from(deskAppAutoGroups)
      .innerJoin(peopleGroups, eq(peopleGroups.id, deskAppAutoGroups.groupId))
      .where(inArray(deskAppAutoGroups.appId, appIds));
    const memberOf = new Set(
      (
        await tx
          .select({ groupId: peopleGroupMembers.groupId })
          .from(peopleGroupMembers)
          .where(eq(peopleGroupMembers.personId, personId))
      ).map((m) => m.groupId),
    );
    const inAuto = (appId: string) =>
      autoRows.some(
        (g) =>
          g.appId === appId &&
          (memberOf.has(g.groupId) ||
            g.kind === "everyone" ||
            (me.department != null && g.kind === `department:${me.department}`)),
      );

    const grants = await tx
      .select({ appId: accessGrants.appId })
      .from(accessGrants)
      .where(and(eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)));
    const held = new Set(grants.map((g) => g.appId));
    const open = await tx
      .select({ appId: accessRequests.appId })
      .from(accessRequests)
      .where(and(eq(accessRequests.personId, personId), inArray(accessRequests.state, OPEN_STATES)));
    const pending = new Set(open.map((r) => r.appId));

    return apps.map((a) => {
      let levels = a.approvalLevels;
      if (levels > 0 && inAuto(a.id)) levels = 0;
      // Level 2 with a manager who owns the app: one approval covers both.
      if (levels === 2 && a.ownerPersonId && a.ownerPersonId === me.managerId) levels = 1;
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        description: a.description,
        iconKey: a.iconKey,
        logoUrl: logoUrlOf(a.id, a.logoAttachmentId),
        color: a.color,
        ownerName: a.ownerPersonId ? (ownerName.get(a.ownerPersonId) ?? null) : null,
        tiers: tiers
          .filter((t) => t.appId === a.id)
          .map((t) => ({ id: t.id, name: t.name, monthlyCostCents: t.monthlyCostCents, privileged: t.privileged })),
        levels,
        held: held.has(a.id),
        pending: pending.has(a.id),
      };
    });
  });
}

/** Names behind the person ids of a circuit preview, plus the app's connector. */
export async function previewContext(
  tenantId: string,
  appId: string,
  personIds: string[],
  autoRule: string | null = null,
): Promise<{
  names: Record<string, string>;
  connectorName: string | null;
  ownerPersonId: string | null;
  autoGroupName: string | null;
}> {
  return withTenant(tenantId, async (tx) => {
    const ids = [...new Set(personIds)];
    const rows = ids.length
      ? await tx.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, ids))
      : [];
    const [app] = await tx
      .select({ connectorId: deskApps.connectorId, ownerPersonId: deskApps.ownerPersonId })
      .from(deskApps)
      .where(eq(deskApps.id, appId));
    const connector = app?.connectorId
      ? (await tx.select({ name: deskConnectors.name }).from(deskConnectors).where(eq(deskConnectors.id, app.connectorId)))[0]
      : undefined;
    const groupId = autoRule?.startsWith("group:") ? autoRule.slice("group:".length) : null;
    const group = groupId
      ? (await tx.select({ name: peopleGroups.name }).from(peopleGroups).where(eq(peopleGroups.id, groupId)))[0]
      : undefined;
    return {
      names: Object.fromEntries(rows.map((r) => [r.id, r.name])),
      connectorName: connector?.name ?? null,
      ownerPersonId: app?.ownerPersonId ?? null,
      autoGroupName: group?.name ?? null,
    };
  });
}

/* ---------- SD-E2 — my access ---------- */

export type TimelineStep = {
  kind: "created" | StepName | "provisioning" | "active";
  /** The steps a single approval covered (manager and owner). */
  merged: StepName[];
  state: "done" | "current" | "todo" | "refused" | "cancelled";
  /** Approver name, or null for the created/provisioning/active steps. */
  who: string | null;
  at: string | null;
};

export type MyRequest = {
  id: string;
  ticketNumber: number;
  appId: string;
  appName: string;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
  tierName: string;
  state: RequestState;
  durationDays: number | null;
  createdAt: string;
  provisioning: ConnectorKindName;
  steps: TimelineStep[];
  canCancel: boolean;
};

export type MyGrant = {
  id: string;
  appId: string;
  appName: string;
  iconKey: string | null;
  logoUrl: string | null;
  color: string | null;
  tierId: string;
  tierName: string;
  grantedAt: string;
  expiresOn: string | null;
  canExtend: boolean;
};

export type MyHardware = {
  id: string;
  tag: string;
  model: string;
  type: string;
  status: string;
  warrantyEndsOn: string | null;
};

export type MyAccess = { requests: MyRequest[]; grants: MyGrant[]; hardware: MyHardware[] };

/** A refused request stays on "My access" this long, so the employee sees the outcome. */
const REFUSED_VISIBLE_DAYS = 30;

export async function myAccess(tenantId: string, personId: string): Promise<MyAccess> {
  return withTenant(tenantId, async (tx) => {
    const since = new Date(Date.now() - REFUSED_VISIBLE_DAYS * 86_400_000);
    const reqRows = await tx
      .select({
        r: accessRequests,
        number: tickets.number,
        app: {
          id: deskApps.id,
          name: deskApps.name,
          iconKey: deskApps.iconKey,
          logoAttachmentId: deskApps.logoAttachmentId,
          color: deskApps.color,
        },
        tierName: deskAppTiers.name,
        connector: { kind: deskConnectors.kind, status: deskConnectors.status },
      })
      .from(accessRequests)
      .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
      .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
      .leftJoin(deskConnectors, eq(deskConnectors.id, deskApps.connectorId))
      .where(
        and(
          eq(accessRequests.personId, personId),
          or(
            inArray(accessRequests.state, OPEN_STATES),
            and(eq(accessRequests.state, "refused"), gt(accessRequests.updatedAt, since)),
          ),
        ),
      )
      .orderBy(desc(accessRequests.createdAt));

    const requestIds = reqRows.map((x) => x.r.id);
    const approvals = requestIds.length
      ? await tx
          .select({
            requestId: accessApprovals.requestId,
            step: accessApprovals.step,
            position: accessApprovals.position,
            mergedSteps: accessApprovals.mergedSteps,
            decision: accessApprovals.decision,
            decidedAt: accessApprovals.decidedAt,
            approverName: people.name,
          })
          .from(accessApprovals)
          .leftJoin(people, eq(people.id, accessApprovals.approverPersonId))
          .where(inArray(accessApprovals.requestId, requestIds))
          .orderBy(asc(accessApprovals.position))
      : [];

    const requests: MyRequest[] = reqRows.map(({ r, number, app, tierName, connector }) => {
      const state = r.state as RequestState;
      const mine = approvals.filter((a) => a.requestId === r.id);
      const steps: TimelineStep[] = [
        { kind: "created", merged: [], state: "done", who: null, at: iso(r.createdAt) },
      ];
      let currentFound = false;
      for (const a of mine) {
        if (a.decision === "skipped") continue;
        let s: TimelineStep["state"] = "todo";
        if (a.decision === "approved") s = "done";
        else if (a.decision === "refused") s = "refused";
        else if (state === "cancelled") s = currentFound ? "todo" : "cancelled";
        else if (AWAITING.includes(state) && !currentFound) s = "current";
        if (s === "current" || s === "cancelled") currentFound = true;
        steps.push({
          kind: a.step as StepName,
          merged: (a.mergedSteps ?? []) as StepName[],
          state: s,
          who: a.approverName,
          at: iso(a.decidedAt),
        });
      }
      const provState: TimelineStep["state"] =
        state === "provisioning" || state === "provisioning_failed"
          ? "current"
          : state === "active"
            ? "done"
            : "todo";
      steps.push({ kind: "provisioning", merged: [], state: provState, who: null, at: null });
      steps.push({ kind: "active", merged: [], state: state === "active" ? "done" : "todo", who: null, at: null });
      return {
        id: r.id,
        ticketNumber: number,
        appId: app.id,
        appName: app.name,
        iconKey: app.iconKey,
        logoUrl: logoUrlOf(app.id, app.logoAttachmentId),
        color: app.color,
        tierName,
        state,
        durationDays: r.durationDays,
        createdAt: iso(r.createdAt)!,
        provisioning: effectiveKind(connector?.kind ? (connector as { kind: ConnectorKindName; status: string }) : null),
        steps,
        canCancel: AWAITING.includes(state),
      };
    });

    const openApps = new Set(requests.filter((r) => OPEN_STATES.includes(r.state)).map((r) => r.appId));
    const grantRows = await tx
      .select({
        g: accessGrants,
        app: {
          id: deskApps.id,
          name: deskApps.name,
          iconKey: deskApps.iconKey,
          logoAttachmentId: deskApps.logoAttachmentId,
          color: deskApps.color,
        },
        tierName: deskAppTiers.name,
      })
      .from(accessGrants)
      .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
      .where(and(eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)))
      .orderBy(asc(accessGrants.grantedAt));
    const grants: MyGrant[] = grantRows.map(({ g, app, tierName }) => ({
      id: g.id,
      appId: app.id,
      appName: app.name,
      iconKey: app.iconKey,
      logoUrl: logoUrlOf(app.id, app.logoAttachmentId),
      color: app.color,
      tierId: g.tierId,
      tierName,
      grantedAt: iso(g.grantedAt)!,
      expiresOn: g.expiresOn,
      canExtend: g.expiresOn != null && !openApps.has(app.id),
    }));

    const hardware = await tx
      .select({
        id: hardwareAssets.id,
        tag: hardwareAssets.tag,
        model: hardwareAssets.model,
        type: hardwareAssets.type,
        status: hardwareAssets.status,
        warrantyEndsOn: hardwareAssets.warrantyEndsOn,
      })
      .from(hardwareAssets)
      .where(and(eq(hardwareAssets.assignedPersonId, personId), ne(hardwareAssets.status, "retired")))
      .orderBy(asc(hardwareAssets.type), asc(hardwareAssets.tag));

    return { requests, grants, hardware };
  });
}

/** A grant of this person, for the "extend" drawer. */
export async function grantOf(tenantId: string, personId: string, grantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [g] = await tx
      .select({ id: accessGrants.id, appId: accessGrants.appId, tierId: accessGrants.tierId, expiresOn: accessGrants.expiresOn })
      .from(accessGrants)
      .where(and(eq(accessGrants.id, grantId), eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)));
    return g ?? null;
  });
}

/* ---------- SD-M1 — approvals ---------- */

export type ApprovalItem = {
  approvalId: string;
  requestId: string;
  ticketNumber: number;
  step: StepName;
  merged: StepName[];
  /** The manager this approval was delegated from. */
  onBehalfOfName: string | null;
  requester: {
    id: string;
    name: string;
    title: string | null;
    department: string | null;
    startsOn: string | null;
  };
  app: {
    id: string;
    name: string;
    iconKey: string | null;
    logoUrl: string | null;
    color: string | null;
    provisioning: ConnectorKindName;
  };
  tier: { id: string; name: string; monthlyCostCents: number; privileged: boolean };
  durationDays: number | null;
  justification: string | null;
  createdAt: string;
  /** Approvals left after this one, in order. */
  after: Array<{ step: StepName; name: string | null }>;
  /** Colleagues of the requester's department (requester excluded) and how many hold the app. */
  peers: { holding: number; total: number } | null;
};

export async function pendingApprovals(tenantId: string, personId: string): Promise<ApprovalItem[]> {
  return withTenant(tenantId, async (tx) => {
    const ids = await currentApprovalIds(tx, personId);
    if (ids.length === 0) return [];
    const rows = await tx
      .select({
        a: accessApprovals,
        r: accessRequests,
        number: tickets.number,
        requester: {
          id: people.id,
          name: people.name,
          title: people.title,
          department: people.department,
          startsOn: people.startsOn,
        },
        app: {
          id: deskApps.id,
          name: deskApps.name,
          iconKey: deskApps.iconKey,
          logoAttachmentId: deskApps.logoAttachmentId,
          color: deskApps.color,
        },
        connector: { kind: deskConnectors.kind, status: deskConnectors.status },
        tier: {
          id: deskAppTiers.id,
          name: deskAppTiers.name,
          monthlyCostCents: deskAppTiers.monthlyCostCents,
          privileged: deskAppTiers.privileged,
        },
      })
      .from(accessApprovals)
      .innerJoin(accessRequests, eq(accessRequests.id, accessApprovals.requestId))
      .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
      .innerJoin(people, eq(people.id, accessRequests.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
      .leftJoin(deskConnectors, eq(deskConnectors.id, deskApps.connectorId))
      .where(inArray(accessApprovals.id, ids))
      .orderBy(desc(accessRequests.createdAt));

    const requestIds = rows.map((x) => x.r.id);
    const later = await tx
      .select({
        requestId: accessApprovals.requestId,
        step: accessApprovals.step,
        position: accessApprovals.position,
        decision: accessApprovals.decision,
        name: people.name,
      })
      .from(accessApprovals)
      .leftJoin(people, eq(people.id, accessApprovals.approverPersonId))
      .where(inArray(accessApprovals.requestId, requestIds))
      .orderBy(asc(accessApprovals.position));
    const behalfIds = rows.map((x) => x.a.onBehalfOfPersonId).filter((x): x is string => !!x);
    const behalf = behalfIds.length
      ? await tx.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, behalfIds))
      : [];
    const behalfName = new Map(behalf.map((b) => [b.id, b.name]));

    // Peers: colleagues of the same department and whether they hold the app.
    const departments = [...new Set(rows.map((x) => x.requester.department).filter((d): d is string => !!d))];
    const colleagues = departments.length
      ? await tx
          .select({ id: people.id, department: people.department })
          .from(people)
          .where(and(inArray(people.department, departments), ne(people.status, "departed")))
      : [];
    const appIds = [...new Set(rows.map((x) => x.app.id))];
    const holders = colleagues.length
      ? await tx
          .select({ personId: accessGrants.personId, appId: accessGrants.appId })
          .from(accessGrants)
          .where(
            and(
              inArray(accessGrants.appId, appIds),
              inArray(accessGrants.personId, colleagues.map((c) => c.id)),
              isNull(accessGrants.revokedAt),
            ),
          )
      : [];

    return rows.map(({ a, r, number, requester, app, connector, tier }) => {
      const team = requester.department
        ? colleagues.filter((c) => c.department === requester.department && c.id !== requester.id)
        : [];
      const holding = team.filter((c) => holders.some((h) => h.personId === c.id && h.appId === app.id)).length;
      return {
        approvalId: a.id,
        requestId: r.id,
        ticketNumber: number,
        step: a.step as StepName,
        merged: (a.mergedSteps ?? []) as StepName[],
        onBehalfOfName: a.onBehalfOfPersonId ? (behalfName.get(a.onBehalfOfPersonId) ?? null) : null,
        requester,
        app: {
          id: app.id,
          name: app.name,
          iconKey: app.iconKey,
          logoUrl: logoUrlOf(app.id, app.logoAttachmentId),
          color: app.color,
          provisioning: effectiveKind(connector?.kind ? (connector as { kind: ConnectorKindName; status: string }) : null),
        },
        tier,
        durationDays: r.durationDays,
        justification: r.justification,
        createdAt: iso(r.createdAt)!,
        after: later
          .filter((l) => l.requestId === r.id && l.position > a.position && l.decision === "pending")
          .map((l) => ({ step: l.step as StepName, name: l.name })),
        peers: team.length > 0 ? { holding, total: team.length } : null,
      };
    });
  });
}

/** The few settings the portal states to the employee (A9 → Access, Approvals, Budgets). */
export async function portalSettings(tenantId: string): Promise<{
  reminderDays: number;
  revokeOnExpiry: boolean;
  /** The duration the request drawer starts on, when the tier offers it. */
  defaultTemporaryDays: number;
  budgetPeriod: "monthly" | "yearly";
  escalateAfterHours: number;
  whenAbsent: DeskConfig["approvals"]["whenAbsent"];
}> {
  const c = await getDeskConfig(tenantId);
  return {
    reminderDays: c.access.expiryReminderDays,
    revokeOnExpiry: c.access.revokeOnExpiry,
    defaultTemporaryDays: c.access.defaultTemporaryDays,
    budgetPeriod: c.budgets.period,
    escalateAfterHours: c.approvals.escalateAfterHours,
    whenAbsent: c.approvals.whenAbsent,
  };
}

/** Is this approval pending, assigned to this person, and still actionable? */
export async function approvalStatus(
  tenantId: string,
  personId: string,
  approvalId: string,
): Promise<"actionable" | "withdrawn" | "decided" | "not_yours"> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ approver: accessApprovals.approverPersonId, decision: accessApprovals.decision, state: accessRequests.state })
      .from(accessApprovals)
      .innerJoin(accessRequests, eq(accessRequests.id, accessApprovals.requestId))
      .where(eq(accessApprovals.id, approvalId));
    if (!row || row.approver !== personId) return "not_yours";
    if (row.state === "cancelled") return "withdrawn";
    if (row.decision !== "pending" || !AWAITING.includes(row.state as RequestState)) return "decided";
    return "actionable";
  });
}

/* ---------- SD-M2 — history ---------- */

export type DecisionRow = {
  approvalId: string;
  ticketNumber: number;
  requesterName: string;
  appName: string;
  tierName: string;
  decision: "approved" | "refused";
  step: StepName;
  merged: StepName[];
  via: string | null;
  comment: string | null;
  decidedAt: string | null;
  state: RequestState;
};

export async function decisionHistory(tenantId: string, personId: string, limit = 200): Promise<DecisionRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        a: accessApprovals,
        number: tickets.number,
        state: accessRequests.state,
        requesterName: people.name,
        appName: deskApps.name,
        tierName: deskAppTiers.name,
      })
      .from(accessApprovals)
      .innerJoin(accessRequests, eq(accessRequests.id, accessApprovals.requestId))
      .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
      .innerJoin(people, eq(people.id, accessRequests.personId))
      .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
      .where(
        and(
          eq(accessApprovals.approverPersonId, personId),
          inArray(accessApprovals.decision, ["approved", "refused"]),
        ),
      )
      .orderBy(desc(accessApprovals.decidedAt))
      .limit(limit);
    return rows.map(({ a, number, state, requesterName, appName, tierName }) => ({
      approvalId: a.id,
      ticketNumber: number,
      requesterName,
      appName,
      tierName,
      decision: a.decision as "approved" | "refused",
      step: a.step as StepName,
      merged: (a.mergedSteps ?? []) as StepName[],
      via: a.via,
      comment: a.comment,
      decidedAt: iso(a.decidedAt),
      state: state as RequestState,
    }));
  });
}

/** Ownership checks for the employee's own writes. */
export async function ownsRequest(tenantId: string, personId: string, requestId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(and(eq(accessRequests.id, requestId), eq(accessRequests.personId, personId)));
    return !!r;
  });
}

export async function ownsGrant(tenantId: string, personId: string, grantId: string): Promise<boolean> {
  return (await grantOf(tenantId, personId, grantId)) != null;
}

export async function ownsHardware(tenantId: string, personId: string, hardwareId: string): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const [h] = await tx
      .select({ id: hardwareAssets.id })
      .from(hardwareAssets)
      .where(and(eq(hardwareAssets.id, hardwareId), eq(hardwareAssets.assignedPersonId, personId)));
    return !!h;
  });
}

/* ---------- SD-M1 — absence and delegation ---------- */

/** Today in the workspace's time zone — the calendar the circuit reads absences on. */
export async function tenantToday(tenantId: string): Promise<string> {
  const [row] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId));
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: row?.timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export type DelegationCandidate = { id: string; name: string; title: string | null };

export type AbsencePanel = {
  today: string;
  /** Set while this person is absent (today ≤ absentUntil). */
  absentUntil: string | null;
  /** The delegation of this person covering today, if any. */
  active: { id: string; toPersonId: string; toName: string; startsOn: string; endsOn: string } | null;
  /** Who hands their approvals to this person today. */
  incoming: Array<{ fromName: string; endsOn: string }>;
  /** People who can stand in: active colleagues, the person's manager first. */
  candidates: DelegationCandidate[];
  managerId: string | null;
  managerName: string | null;
};

/** Absent or suspended people cannot stand in: the circuit would pass over them. */
const UNAVAILABLE = ["departed", "suspended"] as const;

export async function absencePanel(tenantId: string, personId: string): Promise<AbsencePanel> {
  const today = await tenantToday(tenantId);
  return withTenant(tenantId, async (tx) => {
    const [me] = await tx
      .select({ id: people.id, absentUntil: people.absentUntil, managerId: people.managerId })
      .from(people)
      .where(eq(people.id, personId));
    const [active] = await tx
      .select({
        id: deskDelegations.id,
        toPersonId: deskDelegations.toPersonId,
        toName: people.name,
        startsOn: deskDelegations.startsOn,
        endsOn: deskDelegations.endsOn,
      })
      .from(deskDelegations)
      .innerJoin(people, eq(people.id, deskDelegations.toPersonId))
      .where(
        and(
          eq(deskDelegations.fromPersonId, personId),
          lte(deskDelegations.startsOn, today),
          gte(deskDelegations.endsOn, today),
        ),
      )
      .orderBy(desc(deskDelegations.createdAt))
      .limit(1);
    // A delegation only takes effect while its author is absent (spec 19 §3).
    const incomingRows = await tx
      .select({ fromName: people.name, endsOn: deskDelegations.endsOn, absentUntil: people.absentUntil })
      .from(deskDelegations)
      .innerJoin(people, eq(people.id, deskDelegations.fromPersonId))
      .where(
        and(
          eq(deskDelegations.toPersonId, personId),
          lte(deskDelegations.startsOn, today),
          gte(deskDelegations.endsOn, today),
        ),
      )
      .orderBy(asc(people.name));
    const rows = await tx
      .select({ id: people.id, name: people.name, title: people.title, absentUntil: people.absentUntil })
      .from(people)
      .where(and(ne(people.id, personId), notInArray(people.status, [...UNAVAILABLE])))
      .orderBy(asc(people.name));
    const available = rows.filter((r) => !r.absentUntil || r.absentUntil < today);
    const managerId = me?.managerId ?? null;
    const manager = managerId ? available.find((r) => r.id === managerId) : undefined;
    const managerName = managerId
      ? (manager?.name ??
        (await tx.select({ name: people.name }).from(people).where(eq(people.id, managerId)))[0]?.name ??
        null)
      : null;
    const candidates = [
      ...(manager ? [manager] : []),
      ...available.filter((r) => r.id !== managerId),
    ].map(({ id, name, title }) => ({ id, name, title }));
    return {
      today,
      absentUntil: me?.absentUntil && me.absentUntil >= today ? me.absentUntil : null,
      active: active ?? null,
      incoming: incomingRows
        .filter((r) => r.absentUntil != null && r.absentUntil >= today)
        .map(({ fromName, endsOn }) => ({ fromName, endsOn })),
      candidates,
      managerId,
      managerName,
    };
  });
}

/** May this person stand in? Same tenant, not themselves, active, not absent. */
export async function isDelegationCandidate(tenantId: string, personId: string, candidateId: string): Promise<boolean> {
  if (personId === candidateId) return false;
  const today = await tenantToday(tenantId);
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ status: people.status, absentUntil: people.absentUntil })
      .from(people)
      .where(eq(people.id, candidateId));
    if (!row || (UNAVAILABLE as readonly string[]).includes(row.status)) return false;
    return !row.absentUntil || row.absentUntil < today;
  });
}

/** The delegation, when this person is the one who gave it. */
export async function ownDelegation(
  tenantId: string,
  personId: string,
  delegationId: string,
): Promise<{ id: string; endsOn: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: deskDelegations.id, endsOn: deskDelegations.endsOn })
      .from(deskDelegations)
      .where(and(eq(deskDelegations.id, delegationId), eq(deskDelegations.fromPersonId, personId)));
    return row ?? null;
  });
}

/** The delegations of this person that cover today or start later. */
export async function currentDelegationIds(tenantId: string, personId: string, today: string): Promise<string[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: deskDelegations.id })
      .from(deskDelegations)
      .where(and(eq(deskDelegations.fromPersonId, personId), gte(deskDelegations.endsOn, today)));
    return rows.map((r) => r.id);
  });
}

/* ---------- Logos ---------- */

/**
 * The uploaded logo of a catalogue application. Employees see the logos of
 * the visible catalogue only; agents (who also manage hidden apps) see all.
 */
export async function appLogo(
  tenantId: string,
  appId: string,
  opts: { includeHidden: boolean },
): Promise<{ id: string; storageKey: string; contentType: string; sizeBytes: number } | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: attachments.id,
        storageKey: attachments.storageKey,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
      })
      .from(deskApps)
      .innerJoin(attachments, and(eq(attachments.id, deskApps.logoAttachmentId), eq(attachments.tenantId, tenantId)))
      .where(
        and(
          eq(deskApps.tenantId, tenantId),
          eq(deskApps.id, appId),
          isNull(deskApps.deletedAt),
          opts.includeHidden ? undefined : eq(deskApps.visible, true),
        ),
      );
    return row ?? null;
  });
}
