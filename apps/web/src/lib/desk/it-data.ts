/**
 * Reads behind the agent-space service desk screens (spec 19 — SD-A1, A2, A5,
 * A7, and the section's secondary navigation).
 *
 * Writes never happen here: they go through the desk API (`@/lib/desk`), which
 * owns the audit trail. Every function below runs inside `withTenant`, so row
 * level security applies even if a filter were forgotten, and returns plain
 * serialisable data (ISO strings, no Date) that server components can hand to
 * client components as-is.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  accessApprovals,
  accessGrants,
  accessRequests,
  accessReviewItems,
  accessReviews,
  auditEvents,
  deskAppAutoGroups,
  deskApps,
  deskAppTiers,
  deskConnectors,
  hardwareAssets,
  people,
  peopleGroups,
  provisioningJobs,
  shadowFindings,
  tickets,
  users,
  withTenant,
  type Tx,
} from "@openhelpdesk/db";

export type RequestState =
  | "awaiting_manager"
  | "awaiting_owner"
  | "awaiting_extra"
  | "provisioning"
  | "active"
  | "refused"
  | "cancelled"
  | "provisioning_failed";

export type HardwareStatus = "assigned" | "in_stock" | "in_repair" | "to_recover" | "retired";
export type ConnectorKindName = "entra" | "google" | "scim" | "manual";

/* ---------- Queue filters (SD-A1) ---------- */

export type QueueFilter = "all" | "approval" | "provision" | "closed";

export const QUEUE_FILTERS: Record<QueueFilter, RequestState[] | null> = {
  all: null,
  approval: ["awaiting_manager", "awaiting_owner", "awaiting_extra"],
  provision: ["provisioning", "provisioning_failed"],
  closed: ["active", "refused", "cancelled"],
};

export const OPEN_REQUEST_STATES: RequestState[] = [
  "awaiting_manager",
  "awaiting_owner",
  "awaiting_extra",
  "provisioning",
  "provisioning_failed",
];

export function parseQueueFilter(v: string | string[] | undefined): QueueFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "approval" || s === "provision" || s === "closed" ? s : "all";
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** An uploaded logo is served by our own attachment route — never a remote URL. */
const logoUrlOf = (attachmentId: string | null) =>
  attachmentId ? `/api/attachments/${attachmentId}` : null;

/* ---------- Section navigation ---------- */

export type DeskNavCounts = {
  openRequests: number;
  apps: number;
  hardware: number;
  /** Progress of the open access review, in percent — null when none is open. */
  reviewPct: number | null;
  newShadow: number;
};

export async function deskNavCounts(tenantId: string): Promise<DeskNavCounts> {
  return withTenant(tenantId, async (tx) => {
    const [[open], [apps], [hw], [shadow], [review]] = await Promise.all([
      tx
        .select({ n: count() })
        .from(accessRequests)
        .where(and(eq(accessRequests.tenantId, tenantId), inArray(accessRequests.state, OPEN_REQUEST_STATES))),
      tx
        .select({ n: count() })
        .from(deskApps)
        .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt))),
      tx
        .select({ n: count() })
        .from(hardwareAssets)
        .where(and(eq(hardwareAssets.tenantId, tenantId), sql`${hardwareAssets.status} <> 'retired'`)),
      tx
        .select({ n: count() })
        .from(shadowFindings)
        .where(and(eq(shadowFindings.tenantId, tenantId), eq(shadowFindings.status, "new"))),
      tx
        .select({ id: accessReviews.id })
        .from(accessReviews)
        .where(and(eq(accessReviews.tenantId, tenantId), eq(accessReviews.state, "open")))
        .orderBy(desc(accessReviews.opensOn))
        .limit(1),
    ]);

    let reviewPct: number | null = null;
    if (review) {
      const [agg] = await tx
        .select({
          total: count(),
          done: sql<number>`count(*) filter (where ${accessReviewItems.decision} <> 'pending')`.mapWith(Number),
        })
        .from(accessReviewItems)
        .where(and(eq(accessReviewItems.tenantId, tenantId), eq(accessReviewItems.reviewId, review.id)));
      const total = agg?.total ?? 0;
      reviewPct = total ? Math.round(((agg?.done ?? 0) / total) * 100) : 0;
    }

    return {
      openRequests: open?.n ?? 0,
      apps: apps?.n ?? 0,
      hardware: hw?.n ?? 0,
      reviewPct,
      newShadow: shadow?.n ?? 0,
    };
  });
}

/* ---------- SD-A1 — queue ---------- */

export type QueueRow = {
  id: string;
  ticketNumber: number;
  appName: string;
  appIconKey: string | null;
  appColor: string | null;
  appLogoUrl: string | null;
  tierName: string;
  requesterName: string;
  department: string | null;
  createdAt: string;
  state: RequestState;
};

export type QueueData = {
  rows: QueueRow[];
  counts: Record<QueueFilter, number>;
};

export async function accessQueue(tenantId: string, filter: QueueFilter): Promise<QueueData> {
  return withTenant(tenantId, async (tx) => {
    const states = QUEUE_FILTERS[filter];
    const rows = await tx
      .select({
        id: accessRequests.id,
        ticketNumber: tickets.number,
        appName: deskApps.name,
        appIconKey: deskApps.iconKey,
        appColor: deskApps.color,
        appLogo: deskApps.logoAttachmentId,
        tierName: deskAppTiers.name,
        requesterName: people.name,
        department: people.department,
        createdAt: accessRequests.createdAt,
        state: accessRequests.state,
      })
      .from(accessRequests)
      .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
      .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
      .innerJoin(people, eq(people.id, accessRequests.personId))
      .where(
        and(
          eq(accessRequests.tenantId, tenantId),
          states ? inArray(accessRequests.state, states) : undefined,
        ),
      )
      .orderBy(desc(accessRequests.createdAt))
      .limit(300);

    const byState = await tx
      .select({ state: accessRequests.state, n: count() })
      .from(accessRequests)
      .where(eq(accessRequests.tenantId, tenantId))
      .groupBy(accessRequests.state);

    const counts: Record<QueueFilter, number> = { all: 0, approval: 0, provision: 0, closed: 0 };
    for (const { state, n } of byState) {
      counts.all += n;
      for (const f of ["approval", "provision", "closed"] as const) {
        if (QUEUE_FILTERS[f]!.includes(state)) counts[f] += n;
      }
    }

    return {
      rows: rows.map((r) => ({
        id: r.id,
        ticketNumber: r.ticketNumber,
        appName: r.appName,
        appIconKey: r.appIconKey,
        appColor: r.appColor,
        appLogoUrl: logoUrlOf(r.appLogo),
        tierName: r.tierName,
        requesterName: r.requesterName,
        department: r.department,
        createdAt: r.createdAt.toISOString(),
        state: r.state,
      })),
      counts,
    };
  });
}

/* ---------- SD-A1 — detail ---------- */

export type JournalLine = {
  id: string;
  at: string;
  action: string;
  actorType: string;
  actorLabel: string | null;
  targetType: string | null;
  before: unknown;
  after: unknown;
};

export type RequestDetail = {
  id: string;
  ticketNumber: number;
  ticketSubject: string;
  state: RequestState;
  stoppedAtState: RequestState | null;
  createdAt: string;
  decidedAt: string | null;
  durationDays: number | null;
  justification: string | null;
  effectiveLevels: number;
  autoRule: string | null;
  source: string;
  budgetOverCents: number | null;
  requester: { id: string; name: string; title: string | null; department: string | null; managerName: string | null };
  app: {
    id: string;
    name: string;
    iconKey: string | null;
    color: string | null;
    logoUrl: string | null;
    ownerPersonId: string | null;
    ownerName: string | null;
    connector: { kind: ConnectorKindName; name: string; status: string } | null;
    seatsPurchased: number | null;
    seatsUsed: number;
  };
  tier: { id: string; name: string; monthlyCostCents: number; privileged: boolean };
  approvals: Array<{
    id: string;
    step: "manager" | "owner" | "privileged" | "finance";
    position: number;
    approverPersonId: string | null;
    approverName: string | null;
    onBehalfOfName: string | null;
    mergedSteps: string[];
    decision: "pending" | "approved" | "refused" | "skipped";
    comment: string | null;
    via: string | null;
    decidedAt: string | null;
    remindedAt: string | null;
    escalatedAt: string | null;
  }>;
  /** The latest provisioning job of the request — the one a manual task ticks. */
  job: { id: string; state: string; action: string; connectorKind: ConnectorKindName; lastError: string | null } | null;
  /** The access the request produced, while it is held. */
  grant: { id: string; grantedAt: string; expiresOn: string | null; revokedAt: string | null } | null;
  journal: JournalLine[];
};

/** The directory entry of an agent, when the IT agent is also an employee. */
export async function personOfAgent(tenantId: string, userId: string): Promise<{ id: string; name: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.userId, userId)))
      .limit(1);
    return row ?? null;
  });
}

async function seatsUsed(tx: Tx, tenantId: string, appIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!appIds.length) return out;
  const rows = await tx
    .select({ appId: accessGrants.appId, n: count() })
    .from(accessGrants)
    .where(and(eq(accessGrants.tenantId, tenantId), inArray(accessGrants.appId, appIds), isNull(accessGrants.revokedAt)))
    .groupBy(accessGrants.appId);
  for (const r of rows) out.set(r.appId, r.n);
  return out;
}

/** Names behind audit actors: agents (users) and employees (people). */
async function actorLabels(
  tx: Tx,
  tenantId: string,
  rows: Array<{ actorType: string; actorId: string | null }>,
): Promise<Map<string, string>> {
  const userIds = [...new Set(rows.filter((r) => r.actorType === "agent" || r.actorType === "user").map((r) => r.actorId!).filter(Boolean))];
  const personIds = [...new Set(rows.filter((r) => r.actorType === "person").map((r) => r.actorId!).filter(Boolean))];
  const out = new Map<string, string>();
  if (userIds.length) {
    for (const u of await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)))) out.set(u.id, u.name);
  }
  if (personIds.length) {
    for (const p of await tx
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), inArray(people.id, personIds)))) out.set(p.id, p.name);
  }
  return out;
}

export async function accessRequestDetail(tenantId: string, requestId: string): Promise<RequestDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({
        req: accessRequests,
        ticketNumber: tickets.number,
        ticketSubject: tickets.subject,
        app: deskApps,
        tier: deskAppTiers,
        person: people,
      })
      .from(accessRequests)
      .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
      .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
      .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
      .innerJoin(people, eq(people.id, accessRequests.personId))
      .where(and(eq(accessRequests.tenantId, tenantId), eq(accessRequests.id, requestId)));
    if (!r) return null;

    const relatedPersonIds = [r.person.managerId, r.app.ownerPersonId].filter((x): x is string => !!x);

    const [approvalRows, connectorRow, jobRows, grantRows, named, used] = await Promise.all([
      tx
        .select()
        .from(accessApprovals)
        .where(and(eq(accessApprovals.tenantId, tenantId), eq(accessApprovals.requestId, requestId)))
        .orderBy(asc(accessApprovals.position)),
      r.app.connectorId
        ? tx
            .select({ kind: deskConnectors.kind, name: deskConnectors.name, status: deskConnectors.status })
            .from(deskConnectors)
            .where(and(eq(deskConnectors.tenantId, tenantId), eq(deskConnectors.id, r.app.connectorId)))
        : Promise.resolve([]),
      tx
        .select()
        .from(provisioningJobs)
        .where(and(eq(provisioningJobs.tenantId, tenantId), eq(provisioningJobs.requestId, requestId)))
        .orderBy(desc(provisioningJobs.createdAt)),
      tx
        .select()
        .from(accessGrants)
        .where(and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.requestId, requestId)))
        .orderBy(desc(accessGrants.grantedAt)),
      relatedPersonIds.length
        ? tx
            .select({ id: people.id, name: people.name })
            .from(people)
            .where(and(eq(people.tenantId, tenantId), inArray(people.id, relatedPersonIds)))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      seatsUsed(tx, tenantId, [r.app.id]),
    ]);
    const nameOf = new Map(named.map((p) => [p.id, p.name]));

    const approverIds = [
      ...new Set(
        approvalRows.flatMap((a) => [a.approverPersonId, a.onBehalfOfPersonId]).filter((x): x is string => !!x),
      ),
    ].filter((id) => !nameOf.has(id));
    if (approverIds.length) {
      for (const p of await tx
        .select({ id: people.id, name: people.name })
        .from(people)
        .where(and(eq(people.tenantId, tenantId), inArray(people.id, approverIds)))) nameOf.set(p.id, p.name);
    }

    // The journal: every audit line about the request, its approvals, its
    // grant and its provisioning jobs — one journal, never a second log.
    const targetIds = [
      requestId,
      r.req.ticketId,
      ...approvalRows.map((a) => a.id),
      ...grantRows.map((g) => g.id),
      ...jobRows.map((j) => j.id),
    ];
    const events = await tx
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.tenantId, tenantId), inArray(auditEvents.targetId, targetIds)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
    const labels = await actorLabels(tx, tenantId, events);

    const job = jobRows.find((j) => j.state === "manual" || j.state === "failed") ?? jobRows[0] ?? null;
    const grant = grantRows[0] ?? null;

    return {
      id: r.req.id,
      ticketNumber: r.ticketNumber,
      ticketSubject: r.ticketSubject,
      state: r.req.state,
      stoppedAtState: r.req.stoppedAtState,
      createdAt: r.req.createdAt.toISOString(),
      decidedAt: iso(r.req.decidedAt),
      durationDays: r.req.durationDays,
      justification: r.req.justification,
      effectiveLevels: r.req.effectiveLevels,
      autoRule: r.req.autoRule,
      source: r.req.source,
      budgetOverCents: r.req.budgetOverCents,
      requester: {
        id: r.person.id,
        name: r.person.name,
        title: r.person.title,
        department: r.person.department,
        managerName: r.person.managerId ? (nameOf.get(r.person.managerId) ?? null) : null,
      },
      app: {
        id: r.app.id,
        name: r.app.name,
        iconKey: r.app.iconKey,
        color: r.app.color,
        logoUrl: logoUrlOf(r.app.logoAttachmentId),
        ownerPersonId: r.app.ownerPersonId,
        ownerName: r.app.ownerPersonId ? (nameOf.get(r.app.ownerPersonId) ?? null) : null,
        // A "manual" connector row is the absence of automation, not a connector.
        connector: connectorRow[0] && connectorRow[0].kind !== "manual" ? connectorRow[0] : null,
        seatsPurchased: r.app.seatsPurchased,
        seatsUsed: used.get(r.app.id) ?? 0,
      },
      tier: {
        id: r.tier.id,
        name: r.tier.name,
        monthlyCostCents: r.tier.monthlyCostCents,
        privileged: r.tier.privileged,
      },
      approvals: approvalRows.map((a) => ({
        id: a.id,
        step: a.step,
        position: a.position,
        approverPersonId: a.approverPersonId,
        approverName: a.approverPersonId ? (nameOf.get(a.approverPersonId) ?? null) : null,
        onBehalfOfName: a.onBehalfOfPersonId ? (nameOf.get(a.onBehalfOfPersonId) ?? null) : null,
        mergedSteps: a.mergedSteps,
        decision: a.decision,
        comment: a.comment,
        via: a.via,
        decidedAt: iso(a.decidedAt),
        remindedAt: iso(a.remindedAt),
        escalatedAt: iso(a.escalatedAt),
      })),
      job: job
        ? { id: job.id, state: job.state, action: job.action, connectorKind: job.connectorKind, lastError: job.lastError }
        : null,
      grant: grant
        ? {
            id: grant.id,
            grantedAt: grant.grantedAt.toISOString(),
            expiresOn: grant.expiresOn,
            revokedAt: iso(grant.revokedAt),
          }
        : null,
      journal: events.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        action: e.action,
        actorType: e.actorType,
        actorLabel: e.actorId ? (labels.get(e.actorId) ?? null) : null,
        targetType: e.targetType,
        before: e.before,
        after: e.after,
      })),
    };
  });
}

/* ---------- SD-A2 — catalogue admin ---------- */

export type AdminTier = {
  id: string;
  name: string;
  monthlyCostCents: number;
  privileged: boolean;
  externalGroup: string | null;
};

export type AdminApp = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  iconKey: string | null;
  color: string | null;
  logoUrl: string | null;
  ownerPersonId: string | null;
  ownerName: string | null;
  approvalLevels: 0 | 1 | 2;
  maxDurationDays: number | null;
  visible: boolean;
  connectorId: string | null;
  connectorKind: ConnectorKindName;
  scimBaseUrl: string | null;
  /** Never the token itself: whether one is saved, and its last four characters. */
  scimTokenHint: string | null;
  seatsPurchased: number | null;
  seatsUsed: number;
  renewsOn: string | null;
  tiers: AdminTier[];
  autoGroupIds: string[];
};

export type CatalogueAdminData = {
  apps: AdminApp[];
  groups: Array<{ id: string; name: string; kind: string }>;
  connectors: Array<{ id: string; kind: ConnectorKindName; name: string; status: string }>;
  people: Array<{ id: string; name: string; department: string | null }>;
};

export async function catalogueAdmin(tenantId: string): Promise<CatalogueAdminData> {
  return withTenant(tenantId, async (tx) => {
    const [appRows, tierRows, autoRows, groupRows, connectorRows, peopleRows] = await Promise.all([
      tx
        .select()
        .from(deskApps)
        .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)))
        .orderBy(asc(deskApps.name)),
      tx
        .select()
        .from(deskAppTiers)
        .where(eq(deskAppTiers.tenantId, tenantId))
        .orderBy(asc(deskAppTiers.position), asc(deskAppTiers.monthlyCostCents)),
      tx.select().from(deskAppAutoGroups).where(eq(deskAppAutoGroups.tenantId, tenantId)),
      tx
        .select({ id: peopleGroups.id, name: peopleGroups.name, kind: peopleGroups.kind })
        .from(peopleGroups)
        .where(eq(peopleGroups.tenantId, tenantId))
        .orderBy(asc(peopleGroups.name)),
      tx
        .select({ id: deskConnectors.id, kind: deskConnectors.kind, name: deskConnectors.name, status: deskConnectors.status })
        .from(deskConnectors)
        .where(eq(deskConnectors.tenantId, tenantId))
        .orderBy(asc(deskConnectors.name)),
      tx
        .select({ id: people.id, name: people.name, department: people.department })
        .from(people)
        .where(and(eq(people.tenantId, tenantId), sql`${people.status} <> 'departed'`))
        .orderBy(asc(people.name)),
    ]);
    const used = await seatsUsed(tx, tenantId, appRows.map((a) => a.id));
    const personName = new Map(peopleRows.map((p) => [p.id, p.name]));
    const connectorKind = new Map(connectorRows.map((c) => [c.id, c.kind]));

    // "Everyone" first, then departments, then the rest — the order people read them in.
    const rank = (k: string) => (k === "everyone" ? 0 : k.startsWith("department") ? 1 : 2);
    const groups = [...groupRows].sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));

    return {
      apps: appRows.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        category: a.category,
        description: a.description,
        iconKey: a.iconKey,
        color: a.color,
        logoUrl: logoUrlOf(a.logoAttachmentId),
        ownerPersonId: a.ownerPersonId,
        ownerName: a.ownerPersonId ? (personName.get(a.ownerPersonId) ?? null) : null,
        approvalLevels: (a.approvalLevels === 0 || a.approvalLevels === 2 ? a.approvalLevels : 1) as 0 | 1 | 2,
        maxDurationDays: a.maxDurationDays,
        visible: a.visible,
        connectorId: a.connectorId,
        connectorKind: a.connectorId ? (connectorKind.get(a.connectorId) ?? "manual") : "manual",
        scimBaseUrl: a.scimBaseUrl,
        scimTokenHint: a.scimToken ? a.scimToken.slice(-4) : null,
        seatsPurchased: a.seatsPurchased,
        seatsUsed: used.get(a.id) ?? 0,
        renewsOn: a.renewsOn,
        tiers: tierRows
          .filter((t) => t.appId === a.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            monthlyCostCents: t.monthlyCostCents,
            privileged: t.privileged,
            externalGroup: t.externalGroup,
          })),
        autoGroupIds: autoRows.filter((g) => g.appId === a.id).map((g) => g.groupId),
      })),
      groups,
      connectors: connectorRows,
      people: peopleRows,
    };
  });
}

/* ---------- SD-A5 — people ---------- */

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  status: "active" | "leaving" | "departed" | "suspended";
  leavesOn: string | null;
};

export async function peopleDirectory(tenantId: string): Promise<PersonRow[]> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: people.id,
        name: people.name,
        email: people.email,
        title: people.title,
        department: people.department,
        status: people.status,
        leavesOn: people.leavesOn,
      })
      .from(people)
      .where(eq(people.tenantId, tenantId))
      .orderBy(asc(people.name)),
  );
}

export type PersonProfile = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  status: PersonRow["status"];
  startsOn: string | null;
  leavesOn: string | null;
  manager: { id: string; name: string } | null;
  grants: Array<{
    id: string;
    appId: string;
    appName: string;
    appIconKey: string | null;
    appColor: string | null;
    appLogoUrl: string | null;
    tierName: string;
    monthlyCostCents: number;
    grantedAt: string;
    expiresOn: string | null;
    lastSeenAt: string | null;
    provisioning: ConnectorKindName;
    source: string;
  }>;
  hardware: Array<{ id: string; tag: string; model: string; type: string; status: HardwareStatus; warrantyEndsOn: string | null }>;
  requests: Array<{ id: string; ticketNumber: number; appName: string; tierName: string; state: RequestState; createdAt: string }>;
};

export async function personProfile(tenantId: string, personId: string): Promise<PersonProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(personId)) return null;
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx
      .select()
      .from(people)
      .where(and(eq(people.tenantId, tenantId), eq(people.id, personId)));
    if (!p) return null;

    const [managerRows, grantRows, hwRows, reqRows] = await Promise.all([
      p.managerId
        ? tx
            .select({ id: people.id, name: people.name })
            .from(people)
            .where(and(eq(people.tenantId, tenantId), eq(people.id, p.managerId)))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      tx
        .select({
          id: accessGrants.id,
          appId: deskApps.id,
          appName: deskApps.name,
          appIconKey: deskApps.iconKey,
          appColor: deskApps.color,
          appLogo: deskApps.logoAttachmentId,
          tierName: deskAppTiers.name,
          monthlyCostCents: deskAppTiers.monthlyCostCents,
          grantedAt: accessGrants.grantedAt,
          expiresOn: accessGrants.expiresOn,
          lastSeenAt: accessGrants.lastSeenAt,
          connectorKind: deskConnectors.kind,
          source: accessGrants.source,
        })
        .from(accessGrants)
        .innerJoin(deskApps, eq(deskApps.id, accessGrants.appId))
        .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessGrants.tierId))
        .leftJoin(deskConnectors, eq(deskConnectors.id, deskApps.connectorId))
        .where(
          and(eq(accessGrants.tenantId, tenantId), eq(accessGrants.personId, personId), isNull(accessGrants.revokedAt)),
        )
        .orderBy(asc(deskApps.name)),
      tx
        .select({
          id: hardwareAssets.id,
          tag: hardwareAssets.tag,
          model: hardwareAssets.model,
          type: hardwareAssets.type,
          status: hardwareAssets.status,
          warrantyEndsOn: hardwareAssets.warrantyEndsOn,
        })
        .from(hardwareAssets)
        .where(and(eq(hardwareAssets.tenantId, tenantId), eq(hardwareAssets.assignedPersonId, personId)))
        .orderBy(asc(hardwareAssets.tag)),
      tx
        .select({
          id: accessRequests.id,
          ticketNumber: tickets.number,
          appName: deskApps.name,
          tierName: deskAppTiers.name,
          state: accessRequests.state,
          createdAt: accessRequests.createdAt,
        })
        .from(accessRequests)
        .innerJoin(tickets, eq(tickets.id, accessRequests.ticketId))
        .innerJoin(deskApps, eq(deskApps.id, accessRequests.appId))
        .innerJoin(deskAppTiers, eq(deskAppTiers.id, accessRequests.tierId))
        .where(and(eq(accessRequests.tenantId, tenantId), eq(accessRequests.personId, personId)))
        .orderBy(desc(accessRequests.createdAt))
        .limit(30),
    ]);

    return {
      id: p.id,
      name: p.name,
      email: p.email,
      title: p.title,
      department: p.department,
      status: p.status,
      startsOn: p.startsOn,
      leavesOn: p.leavesOn,
      manager: managerRows[0] ?? null,
      grants: grantRows.map((g) => ({
        id: g.id,
        appId: g.appId,
        appName: g.appName,
        appIconKey: g.appIconKey,
        appColor: g.appColor,
        appLogoUrl: logoUrlOf(g.appLogo),
        tierName: g.tierName,
        monthlyCostCents: g.monthlyCostCents,
        grantedAt: g.grantedAt.toISOString(),
        expiresOn: g.expiresOn,
        lastSeenAt: iso(g.lastSeenAt),
        provisioning: g.connectorKind ?? "manual",
        source: g.source,
      })),
      hardware: hwRows,
      requests: reqRows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  });
}

/** What the "Assign an application" dialog offers: visible or not, every live app with its tiers. */
export async function grantableApps(
  tenantId: string,
): Promise<Array<{ id: string; name: string; maxDurationDays: number | null; tiers: Array<{ id: string; name: string; monthlyCostCents: number }> }>> {
  return withTenant(tenantId, async (tx) => {
    const apps = await tx
      .select({ id: deskApps.id, name: deskApps.name, maxDurationDays: deskApps.maxDurationDays })
      .from(deskApps)
      .where(and(eq(deskApps.tenantId, tenantId), isNull(deskApps.deletedAt)))
      .orderBy(asc(deskApps.name));
    const tiers = await tx
      .select({ id: deskAppTiers.id, appId: deskAppTiers.appId, name: deskAppTiers.name, monthlyCostCents: deskAppTiers.monthlyCostCents })
      .from(deskAppTiers)
      .where(eq(deskAppTiers.tenantId, tenantId))
      .orderBy(asc(deskAppTiers.position), asc(deskAppTiers.monthlyCostCents));
    return apps.map((a) => ({
      ...a,
      tiers: tiers.filter((t) => t.appId === a.id).map(({ id, name, monthlyCostCents }) => ({ id, name, monthlyCostCents })),
    }));
  });
}

/* ---------- SD-A7 — hardware ---------- */

export type HardwareRow = {
  id: string;
  tag: string;
  model: string;
  type: string;
  serial: string | null;
  status: HardwareStatus;
  warrantyEndsOn: string | null;
  purchasedOn: string | null;
  costCents: number | null;
  assignedPersonId: string | null;
  assignedName: string | null;
};

export async function hardwareInventory(tenantId: string): Promise<HardwareRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: hardwareAssets.id,
        tag: hardwareAssets.tag,
        model: hardwareAssets.model,
        type: hardwareAssets.type,
        serial: hardwareAssets.serial,
        status: hardwareAssets.status,
        warrantyEndsOn: hardwareAssets.warrantyEndsOn,
        purchasedOn: hardwareAssets.purchasedOn,
        costCents: hardwareAssets.costCents,
        assignedPersonId: hardwareAssets.assignedPersonId,
        assignedName: people.name,
      })
      .from(hardwareAssets)
      .leftJoin(people, eq(people.id, hardwareAssets.assignedPersonId))
      .where(and(eq(hardwareAssets.tenantId, tenantId), sql`${hardwareAssets.status} <> 'retired'`))
      .orderBy(asc(hardwareAssets.tag));
    return rows;
  });
}

export async function peopleOptions(tenantId: string): Promise<Array<{ id: string; name: string }>> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.tenantId, tenantId), sql`${people.status} <> 'departed'`))
      .orderBy(asc(people.name)),
  );
}
