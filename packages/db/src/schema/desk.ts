/**
 * Service desk — software access, licences, hardware and the employee lifecycle
 * (spec 19).
 *
 * Every table lives in the `app` schema and carries `tenant_id`, so the generic
 * RLS policy of sql/rls.sql covers it without a line of extra SQL.
 *
 * Three decisions shape this file:
 *
 *  - **An employee is a `person`, never an agent and never only a contact.** The
 *    approval circuit needs a manager, a department, groups, hire and leave
 *    dates — none of which exist elsewhere. A person is always paired with a
 *    contact (`contactId`), because the contact is what signs in to the portal
 *    and what a ticket names as its requester. Agents are billed per seat; an
 *    employee directory of 220 people must never become 220 seats.
 *  - **An access request IS a ticket** of type `access_request` (`ticketId`):
 *    numbering, SLA, assignment, views, search and reports are reused, not
 *    rebuilt. `access_requests` only holds what a ticket cannot express.
 *  - **One journal.** Every transition writes an `audit_events` row
 *    (`targetType = 'access_request' | 'access_grant' | …`). There is no second
 *    log table to keep in sync with the first.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { app, contacts, tenants, tickets, users } from "./app";

/* ---------- Enums ---------- */

export const personStatus = app.enum("person_status", [
  "active",
  /** A leave date is set and in the future. */
  "leaving",
  "departed",
  /** Disabled at the identity provider, not (yet) departed. */
  "suspended",
]);

/** Where a directory row came from — the first configured source wins. */
export const directorySource = app.enum("directory_source", ["scim", "csv", "entra", "google", "manual"]);

/** How an application's accounts are created and removed. */
export const connectorKind = app.enum("connector_kind", ["entra", "google", "scim", "manual"]);
export const connectorStatus = app.enum("connector_status", ["connected", "error", "disabled", "pending"]);

export const accessRequestState = app.enum("access_request_state", [
  "awaiting_manager",
  "awaiting_owner",
  /** Extra levels: privileged role second approver, finance (budget mode). */
  "awaiting_extra",
  "provisioning",
  "active",
  "refused",
  "cancelled",
  /** The connector failed: the request waits for a manual IT task. */
  "provisioning_failed",
]);

export const approvalStep = app.enum("approval_step", ["manager", "owner", "privileged", "finance"]);
export const approvalDecision = app.enum("approval_decision", ["pending", "approved", "refused", "skipped"]);

/** Where a decision was taken — part of the audit evidence. */
export const decisionChannel = app.enum("decision_channel", ["web", "portal", "slack", "teams", "email", "rule", "api"]);

export const grantSource = app.enum("grant_source", ["request", "direct", "onboarding", "import", "scim"]);

export const provisioningAction = app.enum("provisioning_action", ["create", "update", "disable", "delete"]);
export const provisioningJobState = app.enum("provisioning_job_state", [
  "queued",
  "running",
  "done",
  "failed",
  /** Handed to the IT team as a checkable task (manual app, or connector down). */
  "manual",
  "cancelled",
]);

export const hardwareStatus = app.enum("hardware_status", ["assigned", "in_stock", "in_repair", "to_recover", "retired"]);

export const reviewDecision = app.enum("review_decision", ["pending", "keep", "revoke"]);
export const reviewState = app.enum("review_state", ["draft", "open", "closed"]);

export const lifecycleKind = app.enum("lifecycle_kind", ["onboarding", "offboarding"]);
export const lifecycleState = app.enum("lifecycle_state", ["scheduled", "running", "done", "cancelled"]);
export const lifecycleTaskKind = app.enum("lifecycle_task_kind", ["grant", "revoke", "transfer", "hardware"]);

export const shadowStatus = app.enum("shadow_status", ["new", "added", "blocked", "ignored"]);
export const riskLevel = app.enum("risk_level", ["low", "medium", "high"]);

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ---------- Directory ---------- */

export const people = app.table(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** The portal identity and ticket requester. Created with the person. */
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** Set when this employee is also an agent (the IT team itself). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    /** SCIM `department` — drives budgets, packs and "Team" auto-approval groups. */
    department: text("department"),
    managerId: uuid("manager_id"),
    startsOn: date("starts_on"),
    leavesOn: date("leaves_on"),
    status: personStatus("status").notNull().default("active"),
    source: directorySource("source").notNull().default("manual"),
    /** The identity provider's id (SCIM `externalId` or the IdP object id). */
    externalId: text("external_id"),
    /** The raw SCIM resource as last received — kept to answer GET faithfully. */
    scimResource: jsonb("scim_resource"),
    /** Manager on leave or absent: approvals go to the delegate or up the chain. */
    absentUntil: date("absent_until"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("people_tenant_email").on(t.tenantId, t.email),
    uniqueIndex("people_tenant_contact").on(t.tenantId, t.contactId),
    uniqueIndex("people_tenant_external")
      .on(t.tenantId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("people_tenant_manager").on(t.tenantId, t.managerId),
    index("people_tenant_department").on(t.tenantId, t.department),
  ],
);

export const peopleGroups = app.table(
  "people_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    /**
     * `everyone` and `department:<name>` are computed groups (the design's
     * "All employees", "Team Sales"); others are synced or manual.
     */
    kind: text("kind").notNull().default("static"),
    source: directorySource("source").notNull().default("manual"),
    externalId: text("external_id"),
    scimResource: jsonb("scim_resource"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("people_groups_tenant_name").on(t.tenantId, t.name),
    uniqueIndex("people_groups_tenant_external")
      .on(t.tenantId, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const peopleGroupMembers = app.table(
  "people_group_members",
  {
    tenantId: tenantId(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => peopleGroups.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.personId] })],
);

/** A manager hands their approvals to someone else for a period. */
export const deskDelegations = app.table("desk_delegations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  fromPersonId: uuid("from_person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  toPersonId: uuid("to_person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  createdAt: createdAt(),
});

/* ---------- Settings (A9 — the configuration screen) ---------- */

/**
 * One row per tenant. `config` holds the eight tabs of the configuration
 * screen; its shape and defaults live in `@openhelpdesk/desk` (DeskConfig), so
 * a setting added later keeps its default on existing rows.
 */
export const deskSettings = app.table("desk_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  config: jsonb("config").notNull().default({}),
  /** Inbound SCIM bearer token — SHA-256, never stored in clear. */
  scimTokenHash: text("scim_token_hash"),
  scimTokenSuffix: text("scim_token_suffix"),
  scimTokenCreatedAt: timestamp("scim_token_created_at", { withTimezone: true }),
  directorySource: directorySource("directory_source"),
  lastDirectorySyncAt: timestamp("last_directory_sync_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

/** A monthly (or yearly) licence ceiling per department. */
export const deskBudgets = app.table(
  "desk_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    department: text("department").notNull(),
    amountCents: integer("amount_cents").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("desk_budgets_tenant_department").on(t.tenantId, t.department)],
);

/* ---------- Connectors ---------- */

export const deskConnectors = app.table("desk_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  kind: connectorKind("kind").notNull(),
  name: text("name").notNull(),
  /** Non-secret settings: tenant id, domain, base URL, group naming pattern. */
  settings: jsonb("settings").notNull().default({}),
  /** Secrets, encrypted with @openhelpdesk/crypto (encryptSecrets). */
  secrets: text("secrets"),
  status: connectorStatus("status").notNull().default("pending"),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** What a connector did, line by line — the "last runs" list of the screen. */
export const deskConnectorRuns = app.table(
  "desk_connector_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => deskConnectors.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("ok"),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("desk_connector_runs_connector").on(t.connectorId, t.createdAt)],
);

/* ---------- Catalogue ---------- */

export const deskApps = app.table(
  "desk_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    /** A bundled brand icon (@openhelpdesk/ui brand icons) — never a remote favicon. */
    iconKey: text("icon_key"),
    /** An uploaded logo, for apps the bundled set does not cover. */
    logoAttachmentId: uuid("logo_attachment_id"),
    /** Fallback tile colour, used with the initials when there is no logo. */
    color: text("color"),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, { onDelete: "set null" }),
    /** 0 = immediate, 1 = manager, 2 = manager then owner. */
    approvalLevels: integer("approval_levels").notNull().default(1),
    /** Longest grant allowed, in days — null: unlimited (permanent allowed). */
    maxDurationDays: integer("max_duration_days"),
    visible: boolean("visible").notNull().default(true),
    connectorId: uuid("connector_id").references(() => deskConnectors.id, { onDelete: "set null" }),
    /** Outbound SCIM: the application's own SCIM base URL and bearer token. */
    scimBaseUrl: text("scim_base_url"),
    scimToken: text("scim_token"),
    scimTokenExpiresOn: date("scim_token_expires_on"),
    /** Contract. */
    seatsPurchased: integer("seats_purchased"),
    renewsOn: date("renews_on"),
    /** A seat with no sign-in for this many days is inactive (A3). */
    inactiveAfterDays: integer("inactive_after_days").notNull().default(30),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("desk_apps_tenant_slug").on(t.tenantId, t.slug)],
);

/** A licence tier: "Viewer — free", "Editor — €15/month". */
export const deskAppTiers = app.table(
  "desk_app_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    appId: uuid("app_id")
      .notNull()
      .references(() => deskApps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    monthlyCostCents: integer("monthly_cost_cents").notNull().default(0),
    /** Admin-level role: adds a second approver when that setting is on. */
    privileged: boolean("privileged").notNull().default(false),
    /** The IdP group this tier maps to (Entra / Google), e.g. app-figma-editor. */
    externalGroup: text("external_group"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("desk_app_tiers_app").on(t.appId)],
);

/** Groups whose members get the app without approval. */
export const deskAppAutoGroups = app.table(
  "desk_app_auto_groups",
  {
    tenantId: tenantId(),
    appId: uuid("app_id")
      .notNull()
      .references(() => deskApps.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => peopleGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.appId, t.groupId] })],
);

/** Separation of duties: two tiers one person must never hold together. */
export const deskSodRules = app.table("desk_sod_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  tierAId: uuid("tier_a_id")
    .notNull()
    .references(() => deskAppTiers.id, { onDelete: "cascade" }),
  tierBId: uuid("tier_b_id")
    .notNull()
    .references(() => deskAppTiers.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

/** Onboarding packs, per department. */
export const deskPacks = app.table(
  "desk_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    department: text("department").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("desk_packs_tenant_department").on(t.tenantId, t.department)],
);

export const deskPackItems = app.table(
  "desk_pack_items",
  {
    tenantId: tenantId(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => deskPacks.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => deskApps.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id").references(() => deskAppTiers.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.packId, t.appId] })],
);

/* ---------- Requests, approvals, grants ---------- */

export const accessRequests = app.table(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** The ticket this request is — type `access_request`. */
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => deskApps.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => deskAppTiers.id),
    /** null = permanent. */
    durationDays: integer("duration_days"),
    justification: text("justification"),
    state: accessRequestState("state").notNull(),
    /** Levels after auto-approval and merging — 0 means auto-approved. */
    effectiveLevels: integer("effective_levels").notNull(),
    /** Which rule granted it without a human, when effectiveLevels = 0. */
    autoRule: text("auto_rule"),
    /** The state the request was in when refused or cancelled. */
    stoppedAtState: accessRequestState("stopped_at_state"),
    source: text("source").notNull().default("portal"),
    /** Set when this request extends an existing temporary grant. */
    extendsGrantId: uuid("extends_grant_id"),
    /** Budget check result at submission time (A9 → Budgets). */
    budgetOverCents: integer("budget_over_cents"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("access_requests_ticket").on(t.ticketId),
    index("access_requests_tenant_state").on(t.tenantId, t.state),
    index("access_requests_tenant_person").on(t.tenantId, t.personId),
  ],
);

export const accessApprovals = app.table(
  "access_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => accessRequests.id, { onDelete: "cascade" }),
    step: approvalStep("step").notNull(),
    position: integer("position").notNull(),
    approverPersonId: uuid("approver_person_id").references(() => people.id, { onDelete: "set null" }),
    /** The manager this approval was delegated from, or escalated past. */
    onBehalfOfPersonId: uuid("on_behalf_of_person_id").references(() => people.id, { onDelete: "set null" }),
    /** One approval covers two steps: manager who is also the owner. */
    mergedSteps: text("merged_steps").array().notNull().default([]),
    decision: approvalDecision("decision").notNull().default("pending"),
    comment: text("comment"),
    via: decisionChannel("via"),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("access_approvals_request").on(t.requestId),
    index("access_approvals_pending_approver")
      .on(t.tenantId, t.approverPersonId)
      .where(sql`${t.decision} = 'pending'`),
  ],
);

/** The access someone actually holds. */
export const accessGrants = app.table(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => deskApps.id, { onDelete: "cascade" }),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => deskAppTiers.id),
    requestId: uuid("request_id"),
    source: grantSource("source").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresOn: date("expires_on"),
    /** Last sign-in, when a connector reports it. null = unknown, never "never". */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** The account id in the target application (SCIM id, Entra object id). */
    externalAccountId: text("external_account_id"),
    /** Access review decided "revoke": executed when the campaign closes. */
    revokeScheduledAt: timestamp("revoke_scheduled_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("access_grants_tenant_person").on(t.tenantId, t.personId),
    index("access_grants_tenant_app").on(t.tenantId, t.appId),
    uniqueIndex("access_grants_active_person_app")
      .on(t.tenantId, t.personId, t.appId)
      .where(sql`${t.revokedAt} is null`),
  ],
);

/** Every account creation or removal, automatic or handed to IT. */
export const provisioningJobs = app.table(
  "provisioning_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => accessGrants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id"),
    action: provisioningAction("action").notNull(),
    state: provisioningJobState("state").notNull().default("queued"),
    connectorKind: connectorKind("connector_kind").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** When handed to IT: who ticked it. */
    doneByUserId: uuid("done_by_user_id").references(() => users.id, { onDelete: "set null" }),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("provisioning_jobs_state").on(t.state, t.runAfter)],
);

/* ---------- Hardware ---------- */

export const hardwareAssets = app.table(
  "hardware_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    tag: text("tag").notNull(),
    model: text("model").notNull(),
    type: text("type").notNull(),
    serial: text("serial"),
    assignedPersonId: uuid("assigned_person_id").references(() => people.id, { onDelete: "set null" }),
    status: hardwareStatus("status").notNull().default("in_stock"),
    warrantyEndsOn: date("warranty_ends_on"),
    purchasedOn: date("purchased_on"),
    costCents: integer("cost_cents"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("hardware_assets_tenant_tag").on(t.tenantId, t.tag)],
);

/* ---------- Access reviews ---------- */

export const accessReviews = app.table("access_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  frameworks: text("frameworks").array().notNull().default([]),
  /** all | sensitive | privileged */
  scope: text("scope").notNull().default("sensitive"),
  /** managers | owners | both */
  reviewers: text("reviewers").notNull().default("managers"),
  state: reviewState("state").notNull().default("open"),
  opensOn: date("opens_on").notNull(),
  dueOn: date("due_on").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const accessReviewItems = app.table(
  "access_review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => accessReviews.id, { onDelete: "cascade" }),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => accessGrants.id, { onDelete: "cascade" }),
    reviewerPersonId: uuid("reviewer_person_id").references(() => people.id, { onDelete: "set null" }),
    decision: reviewDecision("decision").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** leaving | unused — the flag shown next to the line. */
    signal: text("signal"),
    signalDetail: text("signal_detail"),
  },
  (t) => [
    index("access_review_items_review").on(t.reviewId),
    uniqueIndex("access_review_items_review_grant").on(t.reviewId, t.grantId),
  ],
);

/* ---------- Joiners and leavers ---------- */

export const lifecyclePlans = app.table(
  "lifecycle_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: lifecycleKind("kind").notNull(),
    executeAt: timestamp("execute_at", { withTimezone: true }).notNull(),
    state: lifecycleState("state").notNull().default("scheduled"),
    packId: uuid("pack_id").references(() => deskPacks.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("lifecycle_plans_due").on(t.state, t.executeAt)],
);

export const lifecycleTasks = app.table(
  "lifecycle_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => lifecyclePlans.id, { onDelete: "cascade" }),
    kind: lifecycleTaskKind("kind").notNull(),
    /** Stable key of the task (e.g. `transfer:drive`) — labels are rendered by the UI. */
    key: text("key").notNull(),
    detail: jsonb("detail").notNull().default({}),
    appId: uuid("app_id").references(() => deskApps.id, { onDelete: "set null" }),
    tierId: uuid("tier_id").references(() => deskAppTiers.id, { onDelete: "set null" }),
    grantId: uuid("grant_id").references(() => accessGrants.id, { onDelete: "set null" }),
    hardwareId: uuid("hardware_id").references(() => hardwareAssets.id, { onDelete: "set null" }),
    /** Executed by a connector at executeAt, rather than ticked by a person. */
    automatic: boolean("automatic").notNull().default(false),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneByUserId: uuid("done_by_user_id").references(() => users.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("lifecycle_tasks_plan").on(t.planId)],
);

/* ---------- Shadow IT ---------- */

export const shadowFindings = app.table(
  "shadow_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    iconKey: text("icon_key"),
    /** google_oauth | entra_signins | expenses */
    source: text("source").notNull(),
    users: integer("users").notNull().default(0),
    monthlySpendCents: integer("monthly_spend_cents"),
    risk: riskLevel("risk").notNull().default("low"),
    riskReason: text("risk_reason"),
    status: shadowStatus("status").notNull().default("new"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shadow_findings_tenant_domain").on(t.tenantId, t.domain)],
);
