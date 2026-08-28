/**
 * `app` schema — the multi-tenant product core.
 *
 * Every table (except `tenants`) carries `tenant_id`; isolation is guaranteed by the
 * RLS policies of sql/rls.sql, activated via `withTenant()` (client.ts).
 */
import {
  boolean,
  date,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";

export const app = pgSchema("app");

/* ---------- Enums ---------- */

export const ticketStatus = app.enum("ticket_status", [
  "new",
  "open",
  "waiting",
  "on_hold",
  "resolved",
  "closed",
]);
export const ticketPriority = app.enum("ticket_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
export const ticketChannel = app.enum("ticket_channel", [
  "email",
  "portal",
  "widget",
  "api",
]);
export const userRole = app.enum("user_role", ["owner", "admin", "agent", "viewer"]);
export const userStatus = app.enum("user_status", ["active", "invited", "disabled"]);
export const messageKind = app.enum("message_kind", [
  "public_reply",
  "internal_note",
  "system_event",
]);
export const messageAuthorType = app.enum("message_author_type", [
  "agent",
  "contact",
  "system",
]);
export const viewShare = app.enum("view_share", ["private", "team", "everyone"]);
/**
 * V2 — how one ticket relates to another (AG-04, "Liés" panel).
 *
 * Only explicit links live in the table. "Same organisation" is not one of
 * these: it is a fact the data already knows, and storing it would mean keeping
 * a copy in step with every organisation change.
 */
/**
 * V2 — why the ticket happened (AG-04, Resolution tab).
 *
 * A fixed list, not free text: the point of recording a cause is to count causes,
 * and a free field gives you forty spellings of "product bug". Deliberately
 * short — a taxonomy nobody can hold in their head gets filled in at random.
 */
export const resolutionCause = app.enum("resolution_cause", [
  "product_bug",
  "configuration",
  "user_error",
  "third_party",
  "duplicate",
  "no_fault_found",
]);
export const ticketLinkRelation = app.enum("ticket_link_relation", [
  "related",
  "duplicate",
  "incident",
]);
export const macroAvailability = app.enum("macro_availability", [
  "everyone",
  "team",
  "personal",
]);
export const ruleKind = app.enum("rule_kind", ["trigger", "scheduled"]);
export const fieldType = app.enum("field_type", [
  "text",
  "select",
  "multi_select",
  "date",
  "number",
  "checkbox",
]);
export const articleStatus = app.enum("article_status", ["draft", "published"]);
export const csatScore = app.enum("csat_score", ["good", "bad"]);
export const contactAuthMethod = app.enum("contact_auth_method", ["magic_link", "sso"]);
export const domainStatus = app.enum("domain_status", ["pending", "verified", "failed"]);
export const ssoProtocol = app.enum("sso_protocol", ["oidc", "saml"]);
export const ssoProvider = app.enum("sso_provider", ["entra", "google", "okta", "generic"]);
export const ssoConnectionStatus = app.enum("sso_connection_status", [
  "active",
  "pending",
  "error",
  "disabled",
]);
export const ssoAuthResult = app.enum("sso_auth_result", ["success", "failure"]);

/* ---------- Root ---------- */

export const tenants = app.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  /** Identifier written by the control plane — opaque to the product, null without one. */
  plan: text("plan"),
  /*
   * Lifecycle and entitlement state — columns DENORMALISED by an external control
   * plane, which the product does nothing but read. Standalone, they keep their
   * defaults and serve no purpose.
   */
  /** active | trial | suspended | deleting. */
  status: text("status").notNull().default("active"),
  /**
   * Why the workspace is suspended, as a stable code — not prose to display.
   *
   * Without it the product knew only THAT it was suspended, so its one paused
   * screen told everyone to pick a plan or shrink the team. That is the way out
   * of a billing suspension and of no other: for a workspace paused because its
   * address was never confirmed, the advice was simply wrong, and the only real
   * remedy went unmentioned.
   *
   * Read, never matched on loosely: the product maps known codes to its own
   * wording and falls back to the generic message for anything it does not
   * know, so a control plane may add reasons without waiting for the product.
   * Null when active, and always null on a standalone instance.
   */
  suspendedReason: text("suspended_reason"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** Resolved capabilities — null: the product falls back on the core ones. */
  entitlements: jsonb("entitlements"),
  /** Label to display, written by the control plane — null: nothing to display. */
  planName: text("plan_name"),
  /** Written by the control plane: { seats, includedSeats, interval, seatPriceCents,
   * currency, currentPeriodEnd, cancelAtPeriodEnd, dunningDeadline } */
  billing: jsonb("billing"),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  branding: jsonb("branding").notNull().default({}),
  ticketNumberFormat: text("ticket_number_format").notNull().default("#{number}"),
  /** { enabled: boolean, question: string } — ST-08. */
  csatConfig: jsonb("csat_config").notNull().default({}),
  /** { welcomeText, kbPublic, widget: { enabled, color, position, title } } — ST-09. */
  portalConfig: jsonb("portal_config").notNull().default({}),
  // v1.1 — SSO
  ssoDelegationEnabled: boolean("sso_delegation_enabled").notNull().default(false),
  agentSsoConfig: jsonb("agent_sso_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- People ---------- */

export const users = app.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("agent"),
    status: userStatus("status").notNull().default("invited"),
    avatarUrl: text("avatar_url"),
    /**
     * V2 — the agent says whether they are taking work.
     *
     * "Available" is the only state that receives an automatic assignment: a
     * round-robin that keeps filling the queue of someone on leave is how a
     * ticket sits untouched for a week with an owner's name on it.
     */
    available: boolean("available").notNull().default(true),
    /**
     * V2 — waterline of the notification feed.
     *
     * The feed is derived from what already happened (SLA breaches, rule
     * assignments, customer replies, mentions) rather than stored as its own
     * copy of those events, so "read" cannot mean anything but "everything up to
     * this instant". Null = nothing read yet.
     */
    notificationsReadAt: timestamp("notifications_read_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_tenant_email").on(t.tenantId, t.email)],
);

export const teams = app.table("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  businessHoursId: uuid("business_hours_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = app.table(
  "team_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const organizations = app.table("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Auto-attachment domains — the key to domain-based discovery (HRD, v1.1). */
  emailDomains: text("email_domains").array().notNull().default([]),
  /** "Contacts can see their organisation's tickets" (AG-08 / PT-08). */
  sharedTickets: boolean("shared_tickets").notNull().default(false),
  notes: text("notes"),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = app.table(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    locale: text("locale"),
    customFields: jsonb("custom_fields").notNull().default({}),
    blocked: boolean("blocked").notNull().default(false),
    // v1.1 — SSO
    authMethod: contactAuthMethod("auth_method").notNull().default("magic_link"),
    /** OIDC sub or SAML NameID. */
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_tenant_email").on(t.tenantId, t.email)],
);

export const contactOrganizations = app.table(
  "contact_organizations",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.organizationId] })],
);

/* ---------- Email channel (ST-03) ---------- */

export const mailboxKind = app.enum("mailbox_kind", ["provided", "forwarding", "imap"]);

export const mailboxes = app.table(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** An address belongs to exactly one tenant — the resolution key at ingestion. */
    address: text("address").notNull(),
    kind: mailboxKind("kind").notNull().default("provided"),
    /** Forwarding: turns true on the first email received. IMAP: on the first connection. */
    verified: boolean("verified").notNull().default(false),
    senderName: text("sender_name"),
    signatureHtml: text("signature_html"),
    defaultTeamId: uuid("default_team_id").references(() => teams.id),
    /** Form applied to the tickets created from this address (ST-03). */
    formId: uuid("form_id").references(() => ticketForms.id),
    /** IMAP connection (kind = imap) — the password lives in encryptedSecrets. */
    imapHost: text("imap_host"),
    imapPort: integer("imap_port"),
    imapSecure: boolean("imap_secure").notNull().default(true),
    imapUser: text("imap_user"),
    encryptedSecrets: text("encrypted_secrets"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mailboxes_address").on(t.address)],
);

/* ---------- Email sending: per-tenant provider (ST-03) ---------- */

export const mailProvider = app.enum("mail_provider", [
  /** Logs without sending — the default in development. */
  "console",
  /** Any SMTP server: self-hosted, or a Brevo/Mailjet/SES/Postmark relay… */
  "smtp",
  "resend",
  "brevo",
  "mailjet",
]);

export const mailTestStatus = app.enum("mail_test_status", ["untested", "ok", "failed"]);

export const emailSettings = app.table(
  "email_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: mailProvider("provider").notNull().default("console"),
    /** Sending identity. */
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    replyTo: text("reply_to"),
    /** SMTP — the password lives in encryptedSecrets. */
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    /** true = implicit TLS (465); false = STARTTLS (587/25). */
    smtpSecure: boolean("smtp_secure").notNull().default(false),
    smtpUser: text("smtp_user"),
    /** AES-256-GCM encrypted secrets (@openhelpdesk/crypto): { password, apiKey, apiSecret }. */
    encryptedSecrets: text("encrypted_secrets"),
    /** Displayable suffix of the main secret ("••••••1a2b"). */
    secretHint: text("secret_hint"),
    /** Result of the last connection / send test. */
    testStatus: mailTestStatus("test_status").notNull().default("untested"),
    testError: text("test_error"),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_settings_tenant").on(t.tenantId)],
);

export const emailDeliveryStatus = app.enum("email_delivery_status", [
  "queued",
  "sent",
  "failed",
]);

/** Send log — no email is ever lost, and it feeds the ST-03 follow-up. */
export const emailDeliveries = app.table(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    /**
     * "ticket_reply", "csat", "magic_link", "rule", "test"… plus "admin":
     * a message to the workspace's own people about the workspace itself,
     * which keeps being sent while the workspace is suspended.
     */
    kind: text("kind").notNull().default("other"),
    provider: mailProvider("provider").notNull(),
    status: emailDeliveryStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    ticketId: uuid("ticket_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_deliveries_tenant_created").on(t.tenantId, t.createdAt)],
);

/** Log of rejected inbound emails (ST-03) — 30-day retention (housekeeping). */
export const rejectedEmails = app.table(
  "rejected_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromAddress: text("from_address").notNull(),
    subject: text("subject"),
    /** loop · bounce · auto_reply · blocked_sender · empty · spam */
    reason: text("reason").notNull(),
    /** Detail shown in parentheses — e.g. "score 9,2" for spam. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rejected_emails_tenant_created").on(t.tenantId, t.createdAt)],
);

/* ---------- SLA & business hours ---------- */

export const businessHours = app.table("business_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Display order of the calendar chips (ST-07) — not alphabetical. */
  position: integer("position").notNull().default(0),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  /** { mon: [["09:00","18:00"]], … } */
  weeklyHours: jsonb("weekly_hours").notNull().default({}),
  /** [{ date: "2026-12-25", label: "Noël" }, …] */
  holidays: jsonb("holidays").notNull().default([]),
});

export const slaPolicies = app.table("sla_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Evaluation order: the first policy that matches wins (ST-07). */
  position: integer("position").notNull().default(0),
  conditions: jsonb("conditions").notNull().default([]),
  /** { urgent: { firstReplyMin, nextReplyMin, resolveMin }, high: {…}, … } */
  targets: jsonb("targets").notNull().default({}),
  /** null = 24/7. */
  businessHoursId: uuid("business_hours_id").references(() => businessHours.id),
  isDefault: boolean("is_default").notNull().default(false),
});

/* ---------- Fields & forms ---------- */

export const ticketFields = app.table("ticket_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: fieldType("type").notNull(),
  /** Ordered options for select / multi_select. */
  options: jsonb("options").notNull().default([]),
  portalVisible: boolean("portal_visible").notNull().default(false),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const ticketForms = app.table("ticket_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  portalVisible: boolean("portal_visible").notNull().default(true),
  position: integer("position").notNull().default(0),
});

export const formFields = app.table(
  "form_fields",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => ticketForms.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => ticketFields.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.formId, t.fieldId] })],
);

/* ---------- Tickets ---------- */

export const tickets = app.table(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Per-tenant sequential number, assigned by the application. */
    number: integer("number").notNull(),
    subject: text("subject").notNull(),
    status: ticketStatus("status").notNull().default("new"),
    priority: ticketPriority("priority").notNull().default("normal"),
    channel: ticketChannel("channel").notNull(),
    type: text("type"),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => contacts.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    assigneeId: uuid("assignee_id").references(() => users.id),
    teamId: uuid("team_id").references(() => teams.id),
    formId: uuid("form_id").references(() => ticketForms.id),
    tags: text("tags").array().notNull().default([]),
    customFields: jsonb("custom_fields").notNull().default({}),
    slaPolicyId: uuid("sla_policy_id").references(() => slaPolicies.id),
    firstReplyDueAt: timestamp("first_reply_due_at", { withTimezone: true }),
    nextReplyDueAt: timestamp("next_reply_due_at", { withTimezone: true }),
    resolveDueAt: timestamp("resolve_due_at", { withTimezone: true }),
    firstRepliedAt: timestamp("first_replied_at", { withTimezone: true }),
    /** T-30 min warning and SLA breach — set exactly once by the worker. */
    slaWarnedAt: timestamp("sla_warned_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    /** V2 — Resolution tab: why it happened, what to read, what we told them. */
    resolutionCause: resolutionCause("resolution_cause"),
    /** A knowledge-base article worth proposing next time this comes up. */
    resolutionArticleId: uuid("resolution_article_id"),
    /**
     * The summary the customer receives. Stored because it is part of the
     * record, and posted to the thread on resolution — a "customer-visible
     * summary" that the customer never receives would be a label that lies.
     */
    resolutionSummary: text("resolution_summary"),
    /** Whether the satisfaction survey goes out for this ticket. */
    resolutionSendCsat: boolean("resolution_send_csat").notNull().default(true),
    /** CSAT survey sent only once per ticket (ST-08). */
    csatSentAt: timestamp("csat_sent_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Merged ticket: read-only, banner pointing to the target (AG-04). */
    mergedIntoId: uuid("merged_into_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tickets_tenant_number").on(t.tenantId, t.number),
    index("tickets_tenant_status").on(t.tenantId, t.status),
    index("tickets_tenant_assignee").on(t.tenantId, t.assigneeId),
    index("tickets_tenant_requester").on(t.tenantId, t.requesterId),
  ],
);

export const ticketMessages = app.table(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    kind: messageKind("kind").notNull(),
    authorType: messageAuthorType("author_type").notNull(),
    /** users.id or contacts.id depending on authorType; null for system. */
    authorId: uuid("author_id"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    source: ticketChannel("source"),
    /** Original email headers (Message-ID, In-Reply-To…) for threading. */
    emailMeta: jsonb("email_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_tenant_ticket").on(t.tenantId, t.ticketId)],
);

/**
 * V2 — checklist carried by a ticket (AG-04, "Tasks" tab).
 *
 * Separate from messages on purpose: a task has a state and an owner, and the
 * thread is a record of what was said. Resolving the ticket closes what is left
 * open, which is why `done` is a column and not the absence of a row.
 */
export const ticketTasks = app.table(
  "ticket_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Agent the task is on; null = nobody yet. */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_tasks_tenant_ticket").on(t.tenantId, t.ticketId)],
);

/**
 * V2 — notes pinned to a contact (AG-04, "Notes" panel).
 *
 * They belong to the person, not to the ticket: "in month-end close every month,
 * be quick on anything touching invoicing" is worth reading on the next ticket
 * too, which is exactly what a note buried in one thread never is.
 */
export const contactNotes = app.table(
  "contact_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contact_notes_tenant_contact").on(t.tenantId, t.contactId)],
);

/**
 * V2 — explicit link between two tickets (AG-04, "Linked" panel).
 *
 * Stored one way round and read both ways: linking A to B has to surface on B,
 * and two rows for one human fact is two chances to disagree.
 */
export const ticketLinks = app.table(
  "ticket_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    linkedTicketId: uuid("linked_ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    relation: ticketLinkRelation("relation").notNull().default("related"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ticket_links_tenant_ticket").on(t.tenantId, t.ticketId),
    index("ticket_links_tenant_linked").on(t.tenantId, t.linkedTicketId),
    uniqueIndex("ticket_links_pair").on(t.tenantId, t.ticketId, t.linkedTicketId),
  ],
);

export const attachments = app.table("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => ticketMessages.id, {
    onDelete: "cascade",
  }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Productivity ---------- */

export const views = app.table("views", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  shared: viewShare("shared").notNull().default("private"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  conditions: jsonb("conditions").notNull().default([]),
  columns: jsonb("columns").notNull().default([]),
  sort: jsonb("sort").notNull().default({}),
  position: integer("position").notNull().default(0),
});

export const macros = app.table("macros", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  actions: jsonb("actions").notNull().default([]),
  availability: macroAvailability("availability").notNull().default("everyone"),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRules = app.table("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  kind: ruleKind("kind").notNull(),
  name: text("name").notNull(),
  /** Execution order matters (ST-05). */
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  conditionsAll: jsonb("conditions_all").notNull().default([]),
  conditionsAny: jsonb("conditions_any").notNull().default([]),
  actions: jsonb("actions").notNull().default([]),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationRuns = app.table(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
    actionsApplied: jsonb("actions_applied").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_runs_tenant_rule").on(t.tenantId, t.ruleId)],
);

/* ---------- Knowledge base ---------- */

export const kbCategories = app.table("kb_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** Two-level tree: parentId null = category, otherwise section. */
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  icon: text("icon"),
  position: integer("position").notNull().default(0),
});

export const kbArticles = app.table(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => kbCategories.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    bodyHtml: text("body_html"),
    status: articleStatus("status").notNull().default("draft"),
    /** Draft in progress on a published article (AG-10). */
    draftBodyHtml: text("draft_body_html"),
    authorId: uuid("author_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    votesUp: integer("votes_up").notNull().default(0),
    votesDown: integer("votes_down").notNull().default(0),
    seo: jsonb("seo").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kb_articles_tenant_slug").on(t.tenantId, t.slug)],
);

/* ---------- CSAT ---------- */

export const csatResponses = app.table("csat_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => users.id),
  score: csatScore("score").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Developers ---------- */

export const apiKeys = app.table("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Prefix kept in clear text; the full key is never stored. */
  prefix: text("prefix").notNull(),
  hashedKey: text("hashed_key").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhooks = app.table("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  /** Auto-disabled after 7 days of failures (ST-10). */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  failingSince: timestamp("failing_since", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = app.table(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    httpStatus: integer("http_status"),
    latencyMs: integer("latency_ms"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_tenant_webhook").on(t.tenantId, t.webhookId)],
);

export const auditEvents = app.table(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_tenant_created").on(t.tenantId, t.createdAt)],
);

/* ---------- v1.1 — Identity & SSO ---------- */

export const verifiedDomains = app.table(
  "verified_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    /** Published as TXT: ohd-verify=<token>. */
    verificationToken: text("verification_token").notNull(),
    status: domainStatus("status").notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** 3 consecutive failures → SSO suspended, domain back to pending (15-sso § 2.2). */
    failCount: integer("fail_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A verified domain belongs to exactly ONE organization per tenant (invariant no. 2).
    uniqueIndex("verified_domains_tenant_domain").on(t.tenantId, t.domain),
  ],
);

export const orgSsoConnections = app.table(
  "org_sso_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    protocol: ssoProtocol("protocol").notNull(),
    provider: ssoProvider("provider").notNull(),
    status: ssoConnectionStatus("status").notNull().default("pending"),
    /**
     * Config encrypted at rest (client_id, client_secret, tenant_id OR metadata_url,
     * certificate, entity_id). Never returned in clear text by the API — masked
     * suffix only (invariant no. 4).
     */
    encryptedConfig: text("encrypted_config").notNull(),
    /** Displayable suffix of the secret (…x7Kq) and expiry date for the D-30 alert. */
    secretHint: text("secret_hint"),
    secretExpiresAt: timestamp("secret_expires_at", { withTimezone: true }),
    strictMode: boolean("strict_mode").notNull().default(false),
    jitEnabled: boolean("jit_enabled").notNull().default(true),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_sso_connections_org").on(t.organizationId)],
);

export const orgAdminGrants = app.table(
  "org_admin_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "agent" (from AG-08) or "org_admin" (from PT-08). */
    grantedByType: text("granted_by_type").notNull(),
    grantedById: uuid("granted_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_admin_grants_contact_org").on(t.contactId, t.organizationId)],
);

export const ssoAuthEvents = app.table(
  "sso_auth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    result: ssoAuthResult("result").notNull(),
    failureReason: text("failure_reason"),
    ip: text("ip"),
    /** 90-day retention — purged by the worker. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sso_auth_events_tenant_org").on(t.tenantId, t.organizationId)],
);
