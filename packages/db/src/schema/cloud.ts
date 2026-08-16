/**
 * Schéma `cloud` — control plane, invisible du produit.
 * Référence : specs/01-produit-et-architecture.md § 5 (control plane) et
 * specs/13-ecrans-console-cloud.md.
 *
 * Ces tables ne portent pas de RLS tenant : elles ne sont accessibles que par la
 * console et le worker, jamais par l'app produit.
 */
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenants } from "./app";

export const cloud = pgSchema("cloud");

/* ---------- Enums ---------- */

export const cloudTenantStatus = cloud.enum("cloud_tenant_status", [
  "trial",
  "active",
  "suspended",
  "cancelled",
  "deleting",
]);
export const flagState = cloud.enum("flag_state", ["off", "rollout", "on"]);
export const provisioningKind = cloud.enum("provisioning_kind", [
  "create",
  "suspend",
  "reactivate",
  "purge",
]);
export const jobStatus = cloud.enum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);
export const incidentSeverity = cloud.enum("incident_severity", [
  "minor",
  "major",
  "critical",
]);
export const incidentStatus = cloud.enum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);
export const consoleRole = cloud.enum("console_role", [
  "super_admin",
  "ops",
  "finance",
  "support",
]);

/* ---------- Plans & tenants ---------- */

export const plans = cloud.table("plans", {
  /** Slug stable : free, standard, pro, ou plan privé négocié. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isPublic: boolean("is_public").notNull().default(true),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0),
  yearlyPriceCents: integer("yearly_price_cents").notNull().default(0),
  stripeProductId: text("stripe_product_id"),
  stripePriceMonthlyId: text("stripe_price_monthly_id"),
  stripePriceYearlyId: text("stripe_price_yearly_id"),
  /** Quotas numériques + features booléennes — voir DEFAULT_PLAN_ENTITLEMENTS. */
  entitlements: jsonb("entitlements").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cloudTenants = cloud.table("cloud_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  status: cloudTenantStatus("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  /** Purge programmée — rétention 60 j, annulable (CO-04/CO-05). */
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
  internalNotes: text("internal_notes"),
  signupSource: text("signup_source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Facturation (miroir Stripe) ---------- */

export const subscriptions = cloud.table("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudTenantId: uuid("cloud_tenant_id")
    .notNull()
    .references(() => cloudTenants.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("trialing"),
  seats: integer("seats").notNull().default(1),
  mrrCents: integer("mrr_cents").notNull().default(0),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = cloud.table("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudTenantId: uuid("cloud_tenant_id")
    .notNull()
    .references(() => cloudTenants.id, { onDelete: "cascade" }),
  stripeInvoiceId: text("stripe_invoice_id").unique(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  pdfUrl: text("pdf_url"),
});

/** File de dunning : J+1 / J+7 / J+14 → suspension (parcours clé n°4, CO-08). */
export const dunningCases = cloud.table("dunning_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudTenantId: uuid("cloud_tenant_id")
    .notNull()
    .references(() => cloudTenants.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  attempt: integer("attempt").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Usage & flags ---------- */

export const usageRecords = cloud.table(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cloudTenantId: uuid("cloud_tenant_id")
      .notNull()
      .references(() => cloudTenants.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    activeAgents: integer("active_agents").notNull().default(0),
    ticketsCreated: integer("tickets_created").notNull().default(0),
    storageBytes: bigint("storage_bytes", { mode: "number" }).notNull().default(0),
    emailsIn: integer("emails_in").notNull().default(0),
    emailsOut: integer("emails_out").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_records_tenant_day").on(t.cloudTenantId, t.day)],
);

export const featureFlags = cloud.table("feature_flags", {
  key: text("key").primaryKey(),
  description: text("description"),
  state: flagState("state").notNull().default("off"),
  rolloutPercent: integer("rollout_percent").notNull().default(0),
  /** Ciblage par plan (CO-07). */
  planFilter: text("plan_filter").array(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlagOverrides = cloud.table(
  "feature_flag_overrides",
  {
    flagKey: text("flag_key")
      .notNull()
      .references(() => featureFlags.key, { onDelete: "cascade" }),
    cloudTenantId: uuid("cloud_tenant_id")
      .notNull()
      .references(() => cloudTenants.id, { onDelete: "cascade" }),
    value: boolean("value").notNull(),
    /** Justification obligatoire (CO-04, onglet Flags). */
    reason: text("reason").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.flagKey, t.cloudTenantId] })],
);

/* ---------- Provisioning & opérations ---------- */

export const provisioningJobs = cloud.table("provisioning_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  cloudTenantId: uuid("cloud_tenant_id").references(() => cloudTenants.id, {
    onDelete: "set null",
  }),
  kind: provisioningKind("kind").notNull(),
  status: jobStatus("status").notNull().default("pending"),
  /** [{ step: "create_tenant", status: "succeeded", log: "…" }, …] (CO-05). */
  steps: jsonb("steps").notNull().default([]),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = cloud.table("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  severity: incidentSeverity("severity").notNull(),
  status: incidentStatus("status").notNull().default("investigating"),
  /** Composants affectés, publiés sur status.open-helpdesk.com (CO-11). */
  components: text("components").array().notNull().default([]),
  /** [{ at, status, message }] — chaque mise à jour publie sur la status page. */
  updates: jsonb("updates").notNull().default([]),
  postmortem: text("postmortem"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/* ---------- Équipe console ---------- */

export const consoleUsers = cloud.table("console_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: consoleRole("role").notNull().default("support"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consoleAuditEvents = cloud.table("console_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  consoleUserId: uuid("console_user_id").references(() => consoleUsers.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  targetTenantId: uuid("target_tenant_id"),
  /** Les impersonations en évidence : motif obligatoire, durée 30 min (CO-04). */
  detail: jsonb("detail"),
  ip: text("ip"),
  /** Rétention 2 ans (CO-12). */
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
