/**
 * Schéma `app` — cœur produit multi-tenant.
 * Référence : specs/01-produit-et-architecture.md § 5 et specs/15-sso-et-identite.md § 3.
 *
 * Toutes les tables (sauf `tenants`) portent `tenant_id` ; l'isolation est garantie par
 * les politiques RLS de sql/rls.sql, activées via `withTenant()` (client.ts).
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

/* ---------- Racine ---------- */

export const tenants = app.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  locale: text("locale").notNull().default("fr"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  plan: text("plan").notNull().default("free"),
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

/* ---------- Personnes ---------- */

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
  /** Domaines d'auto-rattachement — clé de la découverte par domaine (HRD, v1.1). */
  emailDomains: text("email_domains").array().notNull().default([]),
  /** « Les contacts peuvent voir les tickets de leur organisation » (AG-08 / PT-08). */
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
    /** sub OIDC ou NameID SAML. */
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

/* ---------- Canal email (ST-03) ---------- */

export const mailboxKind = app.enum("mailbox_kind", ["provided", "forwarding", "imap"]);

export const mailboxes = app.table(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Une adresse appartient à exactement un tenant — clé de résolution à l'ingestion. */
    address: text("address").notNull(),
    kind: mailboxKind("kind").notNull().default("provided"),
    /** Transfert : passe à vrai au premier email reçu. IMAP : à la première connexion. */
    verified: boolean("verified").notNull().default(false),
    senderName: text("sender_name"),
    signatureHtml: text("signature_html"),
    defaultTeamId: uuid("default_team_id").references(() => teams.id),
    /** Formulaire appliqué aux tickets créés depuis cette adresse (ST-03). */
    formId: uuid("form_id").references(() => ticketForms.id),
    /** Connexion IMAP (kind = imap) — le mot de passe vit dans encryptedSecrets. */
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

/* ---------- Envoi email : fournisseur par tenant (ST-03) ---------- */

export const mailProvider = app.enum("mail_provider", [
  /** Journalise sans envoyer — défaut en développement. */
  "console",
  /** Serveur SMTP quelconque : auto-hébergé, ou relais Brevo/Mailjet/SES/Postmark… */
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
    /** Identité d'expédition. */
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    replyTo: text("reply_to"),
    /** SMTP — le mot de passe vit dans encryptedSecrets. */
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    /** true = TLS implicite (465) ; false = STARTTLS (587/25). */
    smtpSecure: boolean("smtp_secure").notNull().default(false),
    smtpUser: text("smtp_user"),
    /** Secrets chiffrés AES-256-GCM (@openhelpdesk/crypto) : { password, apiKey, apiSecret }. */
    encryptedSecrets: text("encrypted_secrets"),
    /** Suffixe affichable du secret principal (« ••••••1a2b »). */
    secretHint: text("secret_hint"),
    /** Résultat du dernier test de connexion / d'envoi. */
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

/** Journal des envois — aucun email perdu, et alimente le suivi de ST-03. */
export const emailDeliveries = app.table(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    /** « ticket_reply », « csat », « magic_link », « rule », « test »… */
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

/** Journal des emails entrants rejetés (ST-03) — rétention 30 jours (housekeeping). */
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
    /** Précision affichée entre parenthèses — ex. « score 9,2 » pour le spam. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rejected_emails_tenant_created").on(t.tenantId, t.createdAt)],
);

/* ---------- SLA & horaires ---------- */

export const businessHours = app.table("business_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Ordre d'affichage des chips de calendriers (ST-07) — pas alphabétique. */
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
  /** Ordre d'évaluation : la première politique qui matche s'applique (ST-07). */
  position: integer("position").notNull().default(0),
  conditions: jsonb("conditions").notNull().default([]),
  /** { urgent: { firstReplyMin, nextReplyMin, resolveMin }, high: {…}, … } */
  targets: jsonb("targets").notNull().default({}),
  /** null = 24/7. */
  businessHoursId: uuid("business_hours_id").references(() => businessHours.id),
  isDefault: boolean("is_default").notNull().default(false),
});

/* ---------- Champs & formulaires ---------- */

export const ticketFields = app.table("ticket_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: fieldType("type").notNull(),
  /** Options ordonnées pour select / multi_select. */
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
    /** Numéro séquentiel par tenant, attribué par l'application. */
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
    /** Avertissement T-30 min et dépassement SLA — posés une seule fois par le worker. */
    slaWarnedAt: timestamp("sla_warned_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    /** Enquête CSAT envoyée une seule fois par ticket (ST-08). */
    csatSentAt: timestamp("csat_sent_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Ticket fusionné : lecture seule, bandeau vers la cible (AG-04). */
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
    /** users.id ou contacts.id selon authorType ; null pour system. */
    authorId: uuid("author_id"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    source: ticketChannel("source"),
    /** En-têtes email d'origine (Message-ID, In-Reply-To…) pour le threading. */
    emailMeta: jsonb("email_meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_tenant_ticket").on(t.tenantId, t.ticketId)],
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

/* ---------- Productivité ---------- */

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
  /** L'ordre d'exécution compte (ST-05). */
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

/* ---------- Base de connaissances ---------- */

export const kbCategories = app.table("kb_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** Arborescence 2 niveaux : parentId null = catégorie, sinon section. */
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
    /** Brouillon en cours sur un article publié (AG-10). */
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

/* ---------- Développeurs ---------- */

export const apiKeys = app.table("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Préfixe visible en clair ; la clé complète n'est jamais stockée. */
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
  /** Désactivation auto après 7 jours d'échecs (ST-10). */
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

/* ---------- v1.1 — Identité & SSO (specs/15-sso-et-identite.md § 3) ---------- */

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
    /** Publié en TXT : ohd-verify=<token>. */
    verificationToken: text("verification_token").notNull(),
    status: domainStatus("status").notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** 3 échecs consécutifs → SSO suspendu, domaine repasse en pending (15-sso § 2.2). */
    failCount: integer("fail_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Un domaine vérifié n'appartient qu'à UNE organisation par tenant (invariant n°2).
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
     * Config chiffrée au repos (client_id, client_secret, tenant_id OU metadata_url,
     * certificat, entity_id). Jamais renvoyée en clair par l'API — suffixe masqué
     * uniquement (invariant n°4).
     */
    encryptedConfig: text("encrypted_config").notNull(),
    /** Suffixe affichable du secret (…x7Kq) et date d'expiration pour l'alerte J-30. */
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
    /** "agent" (depuis AG-08) ou "org_admin" (depuis PT-08). */
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
    /** Rétention 90 j — purge par le worker. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sso_auth_events_tenant_org").on(t.tenantId, t.organizationId)],
);
