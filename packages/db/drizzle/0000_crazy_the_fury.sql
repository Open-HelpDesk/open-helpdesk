CREATE SCHEMA "app";
--> statement-breakpoint
CREATE SCHEMA "cloud";
--> statement-breakpoint
CREATE TYPE "app"."article_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "app"."contact_auth_method" AS ENUM('magic_link', 'sso');--> statement-breakpoint
CREATE TYPE "app"."csat_score" AS ENUM('good', 'bad');--> statement-breakpoint
CREATE TYPE "app"."domain_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "app"."field_type" AS ENUM('text', 'select', 'multi_select', 'date', 'number', 'checkbox');--> statement-breakpoint
CREATE TYPE "app"."macro_availability" AS ENUM('everyone', 'team', 'personal');--> statement-breakpoint
CREATE TYPE "app"."message_author_type" AS ENUM('agent', 'contact', 'system');--> statement-breakpoint
CREATE TYPE "app"."message_kind" AS ENUM('public_reply', 'internal_note', 'system_event');--> statement-breakpoint
CREATE TYPE "app"."rule_kind" AS ENUM('trigger', 'scheduled');--> statement-breakpoint
CREATE TYPE "app"."sso_auth_result" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "app"."sso_connection_status" AS ENUM('active', 'pending', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "app"."sso_protocol" AS ENUM('oidc', 'saml');--> statement-breakpoint
CREATE TYPE "app"."sso_provider" AS ENUM('entra', 'google', 'okta', 'generic');--> statement-breakpoint
CREATE TYPE "app"."ticket_channel" AS ENUM('email', 'portal', 'widget', 'api');--> statement-breakpoint
CREATE TYPE "app"."ticket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "app"."ticket_status" AS ENUM('new', 'open', 'waiting', 'on_hold', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "app"."user_role" AS ENUM('owner', 'admin', 'agent', 'viewer');--> statement-breakpoint
CREATE TYPE "app"."user_status" AS ENUM('active', 'invited', 'disabled');--> statement-breakpoint
CREATE TYPE "app"."view_share" AS ENUM('private', 'team', 'everyone');--> statement-breakpoint
CREATE TYPE "cloud"."cloud_tenant_status" AS ENUM('trial', 'active', 'suspended', 'cancelled', 'deleting');--> statement-breakpoint
CREATE TYPE "cloud"."console_role" AS ENUM('super_admin', 'ops', 'finance', 'support');--> statement-breakpoint
CREATE TYPE "cloud"."flag_state" AS ENUM('off', 'rollout', 'on');--> statement-breakpoint
CREATE TYPE "cloud"."incident_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "cloud"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "cloud"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "cloud"."provisioning_kind" AS ENUM('create', 'suspend', 'reactivate', 'purge');--> statement-breakpoint
CREATE TABLE "app"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hashed_key" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "app"."rule_kind" NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"conditions_all" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions_any" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"ticket_id" uuid,
	"actions_applied" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"weekly_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holidays" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."contact_organizations" (
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "contact_organizations_contact_id_organization_id_pk" PRIMARY KEY("contact_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "app"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"locale" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"auth_method" "app"."contact_auth_method" DEFAULT 'magic_link' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."csat_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"agent_id" uuid,
	"score" "app"."csat_score" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."form_fields" (
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "form_fields_form_id_field_id_pk" PRIMARY KEY("form_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "app"."kb_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_html" text,
	"status" "app"."article_status" DEFAULT 'draft' NOT NULL,
	"draft_body_html" text,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"votes_up" integer DEFAULT 0 NOT NULL,
	"votes_down" integer DEFAULT 0 NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."kb_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."macros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"availability" "app"."macro_availability" DEFAULT 'everyone' NOT NULL,
	"team_id" uuid,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."org_admin_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"granted_by_type" text NOT NULL,
	"granted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."org_sso_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"protocol" "app"."sso_protocol" NOT NULL,
	"provider" "app"."sso_provider" NOT NULL,
	"status" "app"."sso_connection_status" DEFAULT 'pending' NOT NULL,
	"encrypted_config" text NOT NULL,
	"secret_hint" text,
	"secret_expires_at" timestamp with time zone,
	"strict_mode" boolean DEFAULT false NOT NULL,
	"jit_enabled" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"shared_tickets" boolean DEFAULT false NOT NULL,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"business_hours_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sso_auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid,
	"result" "app"."sso_auth_result" NOT NULL,
	"failure_reason" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."team_members" (
	"tenant_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "app"."teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_hours_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_number_format" text DEFAULT '#{number}' NOT NULL,
	"sso_delegation_enabled" boolean DEFAULT false NOT NULL,
	"agent_sso_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app"."ticket_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "app"."field_type" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"portal_visible" boolean DEFAULT false NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ticket_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"portal_visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" "app"."message_kind" NOT NULL,
	"author_type" "app"."message_author_type" NOT NULL,
	"author_id" uuid,
	"body_html" text,
	"body_text" text,
	"source" "app"."ticket_channel",
	"email_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"subject" text NOT NULL,
	"status" "app"."ticket_status" DEFAULT 'new' NOT NULL,
	"priority" "app"."ticket_priority" DEFAULT 'normal' NOT NULL,
	"channel" "app"."ticket_channel" NOT NULL,
	"type" text,
	"requester_id" uuid NOT NULL,
	"organization_id" uuid,
	"assignee_id" uuid,
	"team_id" uuid,
	"form_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sla_policy_id" uuid,
	"first_reply_due_at" timestamp with time zone,
	"next_reply_due_at" timestamp with time zone,
	"resolve_due_at" timestamp with time zone,
	"first_replied_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"merged_into_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "app"."user_role" DEFAULT 'agent' NOT NULL,
	"status" "app"."user_status" DEFAULT 'invited' NOT NULL,
	"avatar_url" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."verified_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verification_token" text NOT NULL,
	"status" "app"."domain_status" DEFAULT 'pending' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"shared" "app"."view_share" DEFAULT 'private' NOT NULL,
	"team_id" uuid,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"http_status" integer,
	"latency_ms" integer,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"disabled_at" timestamp with time zone,
	"failing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."cloud_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "cloud"."cloud_tenant_status" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"suspended_reason" text,
	"delete_after" timestamp with time zone,
	"internal_notes" text,
	"signup_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_tenants_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "cloud"."console_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"console_user_id" uuid,
	"action" text NOT NULL,
	"target_tenant_id" uuid,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."console_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "cloud"."console_role" DEFAULT 'support' NOT NULL,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "console_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cloud"."dunning_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."feature_flag_overrides" (
	"flag_key" text NOT NULL,
	"cloud_tenant_id" uuid NOT NULL,
	"value" boolean NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flag_overrides_flag_key_cloud_tenant_id_pk" PRIMARY KEY("flag_key","cloud_tenant_id")
);
--> statement-breakpoint
CREATE TABLE "cloud"."feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text,
	"state" "cloud"."flag_state" DEFAULT 'off' NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"plan_filter" text[],
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"severity" "cloud"."incident_severity" NOT NULL,
	"status" "cloud"."incident_status" DEFAULT 'investigating' NOT NULL,
	"components" text[] DEFAULT '{}' NOT NULL,
	"updates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"postmortem" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cloud"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_tenant_id" uuid NOT NULL,
	"stripe_invoice_id" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_url" text,
	CONSTRAINT "invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "cloud"."plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"monthly_price_cents" integer DEFAULT 0 NOT NULL,
	"yearly_price_cents" integer DEFAULT 0 NOT NULL,
	"stripe_product_id" text,
	"stripe_price_monthly_id" text,
	"stripe_price_yearly_id" text,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_tenant_id" uuid,
	"kind" "cloud"."provisioning_kind" NOT NULL,
	"status" "cloud"."job_status" DEFAULT 'pending' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_tenant_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'trialing' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"mrr_cents" integer DEFAULT 0 NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud"."usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cloud_tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"active_agents" integer DEFAULT 0 NOT NULL,
	"tickets_created" integer DEFAULT 0 NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"emails_in" integer DEFAULT 0 NOT NULL,
	"emails_out" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attachments" ADD CONSTRAINT "attachments_message_id_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."ticket_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "app"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."automation_runs" ADD CONSTRAINT "automation_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."business_hours" ADD CONSTRAINT "business_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_organizations" ADD CONSTRAINT "contact_organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_organizations" ADD CONSTRAINT "contact_organizations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_organizations" ADD CONSTRAINT "contact_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."csat_responses" ADD CONSTRAINT "csat_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."csat_responses" ADD CONSTRAINT "csat_responses_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."csat_responses" ADD CONSTRAINT "csat_responses_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."form_fields" ADD CONSTRAINT "form_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."form_fields" ADD CONSTRAINT "form_fields_form_id_ticket_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "app"."ticket_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."form_fields" ADD CONSTRAINT "form_fields_field_id_ticket_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "app"."ticket_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kb_articles" ADD CONSTRAINT "kb_articles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kb_articles" ADD CONSTRAINT "kb_articles_category_id_kb_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "app"."kb_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kb_articles" ADD CONSTRAINT "kb_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kb_categories" ADD CONSTRAINT "kb_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."macros" ADD CONSTRAINT "macros_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."macros" ADD CONSTRAINT "macros_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."macros" ADD CONSTRAINT "macros_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."org_admin_grants" ADD CONSTRAINT "org_admin_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."org_admin_grants" ADD CONSTRAINT "org_admin_grants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."org_admin_grants" ADD CONSTRAINT "org_admin_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."org_sso_connections" ADD CONSTRAINT "org_sso_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."org_sso_connections" ADD CONSTRAINT "org_sso_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sla_policies" ADD CONSTRAINT "sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sla_policies" ADD CONSTRAINT "sla_policies_business_hours_id_business_hours_id_fk" FOREIGN KEY ("business_hours_id") REFERENCES "app"."business_hours"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sso_auth_events" ADD CONSTRAINT "sso_auth_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sso_auth_events" ADD CONSTRAINT "sso_auth_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."sso_auth_events" ADD CONSTRAINT "sso_auth_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."teams" ADD CONSTRAINT "teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_fields" ADD CONSTRAINT "ticket_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_forms" ADD CONSTRAINT "ticket_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_messages" ADD CONSTRAINT "ticket_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_requester_id_contacts_id_fk" FOREIGN KEY ("requester_id") REFERENCES "app"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_form_id_ticket_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "app"."ticket_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD CONSTRAINT "tickets_sla_policy_id_sla_policies_id_fk" FOREIGN KEY ("sla_policy_id") REFERENCES "app"."sla_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verified_domains" ADD CONSTRAINT "verified_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."verified_domains" ADD CONSTRAINT "verified_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."views" ADD CONSTRAINT "views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."views" ADD CONSTRAINT "views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."views" ADD CONSTRAINT "views_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "app"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "app"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."webhooks" ADD CONSTRAINT "webhooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."cloud_tenants" ADD CONSTRAINT "cloud_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."console_audit_events" ADD CONSTRAINT "console_audit_events_console_user_id_console_users_id_fk" FOREIGN KEY ("console_user_id") REFERENCES "cloud"."console_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."dunning_cases" ADD CONSTRAINT "dunning_cases_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."dunning_cases" ADD CONSTRAINT "dunning_cases_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "cloud"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flag_key_feature_flags_key_fk" FOREIGN KEY ("flag_key") REFERENCES "cloud"."feature_flags"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."invoices" ADD CONSTRAINT "invoices_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."subscriptions" ADD CONSTRAINT "subscriptions_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "cloud"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud"."usage_records" ADD CONSTRAINT "usage_records_cloud_tenant_id_cloud_tenants_id_fk" FOREIGN KEY ("cloud_tenant_id") REFERENCES "cloud"."cloud_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created" ON "app"."audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_tenant_rule" ON "app"."automation_runs" USING btree ("tenant_id","rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_tenant_email" ON "app"."contacts" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "kb_articles_tenant_slug" ON "app"."kb_articles" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "org_admin_grants_contact_org" ON "app"."org_admin_grants" USING btree ("contact_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_sso_connections_org" ON "app"."org_sso_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sso_auth_events_tenant_org" ON "app"."sso_auth_events" USING btree ("tenant_id","organization_id");--> statement-breakpoint
CREATE INDEX "messages_tenant_ticket" ON "app"."ticket_messages" USING btree ("tenant_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_tenant_number" ON "app"."tickets" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "tickets_tenant_status" ON "app"."tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tickets_tenant_assignee" ON "app"."tickets" USING btree ("tenant_id","assignee_id");--> statement-breakpoint
CREATE INDEX "tickets_tenant_requester" ON "app"."tickets" USING btree ("tenant_id","requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email" ON "app"."users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "verified_domains_tenant_domain" ON "app"."verified_domains" USING btree ("tenant_id","domain");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_webhook" ON "app"."webhook_deliveries" USING btree ("tenant_id","webhook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_tenant_day" ON "cloud"."usage_records" USING btree ("cloud_tenant_id","day");