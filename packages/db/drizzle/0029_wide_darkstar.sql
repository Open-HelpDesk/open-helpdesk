CREATE TYPE "app"."access_request_state" AS ENUM('awaiting_manager', 'awaiting_owner', 'awaiting_extra', 'provisioning', 'active', 'refused', 'cancelled', 'provisioning_failed');--> statement-breakpoint
CREATE TYPE "app"."approval_decision" AS ENUM('pending', 'approved', 'refused', 'skipped');--> statement-breakpoint
CREATE TYPE "app"."approval_step" AS ENUM('manager', 'owner', 'privileged', 'finance');--> statement-breakpoint
CREATE TYPE "app"."connector_kind" AS ENUM('entra', 'google', 'scim', 'manual');--> statement-breakpoint
CREATE TYPE "app"."connector_status" AS ENUM('connected', 'error', 'disabled', 'pending');--> statement-breakpoint
CREATE TYPE "app"."decision_channel" AS ENUM('web', 'portal', 'slack', 'teams', 'email', 'rule', 'api');--> statement-breakpoint
CREATE TYPE "app"."directory_source" AS ENUM('scim', 'csv', 'entra', 'google', 'manual');--> statement-breakpoint
CREATE TYPE "app"."grant_source" AS ENUM('request', 'direct', 'onboarding', 'import', 'scim');--> statement-breakpoint
CREATE TYPE "app"."hardware_status" AS ENUM('assigned', 'in_stock', 'in_repair', 'to_recover', 'retired');--> statement-breakpoint
CREATE TYPE "app"."lifecycle_kind" AS ENUM('onboarding', 'offboarding');--> statement-breakpoint
CREATE TYPE "app"."lifecycle_state" AS ENUM('scheduled', 'running', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."lifecycle_task_kind" AS ENUM('grant', 'revoke', 'transfer', 'hardware');--> statement-breakpoint
CREATE TYPE "app"."person_status" AS ENUM('active', 'leaving', 'departed', 'suspended');--> statement-breakpoint
CREATE TYPE "app"."provisioning_action" AS ENUM('create', 'update', 'disable', 'delete');--> statement-breakpoint
CREATE TYPE "app"."provisioning_job_state" AS ENUM('queued', 'running', 'done', 'failed', 'manual', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."review_decision" AS ENUM('pending', 'keep', 'revoke');--> statement-breakpoint
CREATE TYPE "app"."review_state" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "app"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "app"."shadow_status" AS ENUM('new', 'added', 'blocked', 'ignored');--> statement-breakpoint
CREATE TABLE "app"."access_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"step" "app"."approval_step" NOT NULL,
	"position" integer NOT NULL,
	"approver_person_id" uuid,
	"on_behalf_of_person_id" uuid,
	"merged_steps" text[] DEFAULT '{}' NOT NULL,
	"decision" "app"."approval_decision" DEFAULT 'pending' NOT NULL,
	"comment" text,
	"via" "app"."decision_channel",
	"reminded_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"request_id" uuid,
	"source" "app"."grant_source" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_on" date,
	"last_seen_at" timestamp with time zone,
	"external_account_id" text,
	"revoke_scheduled_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"duration_days" integer,
	"justification" text,
	"state" "app"."access_request_state" NOT NULL,
	"effective_levels" integer NOT NULL,
	"auto_rule" text,
	"stopped_at_state" "app"."access_request_state",
	"source" text DEFAULT 'portal' NOT NULL,
	"extends_grant_id" uuid,
	"budget_over_cents" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."access_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"reviewer_person_id" uuid,
	"decision" "app"."review_decision" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"signal" text,
	"signal_detail" text
);
--> statement-breakpoint
CREATE TABLE "app"."access_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"frameworks" text[] DEFAULT '{}' NOT NULL,
	"scope" text DEFAULT 'sensitive' NOT NULL,
	"reviewers" text DEFAULT 'managers' NOT NULL,
	"state" "app"."review_state" DEFAULT 'open' NOT NULL,
	"opens_on" date NOT NULL,
	"due_on" date NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_app_auto_groups" (
	"tenant_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "desk_app_auto_groups_app_id_group_id_pk" PRIMARY KEY("app_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "app"."desk_app_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monthly_cost_cents" integer DEFAULT 0 NOT NULL,
	"privileged" boolean DEFAULT false NOT NULL,
	"external_group" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon_key" text,
	"logo_attachment_id" uuid,
	"color" text,
	"owner_person_id" uuid,
	"approval_levels" integer DEFAULT 1 NOT NULL,
	"max_duration_days" integer,
	"visible" boolean DEFAULT true NOT NULL,
	"connector_id" uuid,
	"scim_base_url" text,
	"scim_token" text,
	"scim_token_expires_on" date,
	"seats_purchased" integer,
	"renews_on" date,
	"inactive_after_days" integer DEFAULT 30 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"department" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_connector_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"level" text DEFAULT 'ok' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "app"."connector_kind" NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secrets" text,
	"status" "app"."connector_status" DEFAULT 'pending' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"to_person_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_pack_items" (
	"tenant_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"tier_id" uuid,
	CONSTRAINT "desk_pack_items_pack_id_app_id_pk" PRIMARY KEY("pack_id","app_id")
);
--> statement-breakpoint
CREATE TABLE "app"."desk_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"department" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scim_token_hash" text,
	"scim_token_suffix" text,
	"scim_token_created_at" timestamp with time zone,
	"directory_source" "app"."directory_source",
	"last_directory_sync_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."desk_sod_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tier_a_id" uuid NOT NULL,
	"tier_b_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."hardware_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"model" text NOT NULL,
	"type" text NOT NULL,
	"serial" text,
	"assigned_person_id" uuid,
	"status" "app"."hardware_status" DEFAULT 'in_stock' NOT NULL,
	"warranty_ends_on" date,
	"purchased_on" date,
	"cost_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."lifecycle_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "app"."lifecycle_kind" NOT NULL,
	"execute_at" timestamp with time zone NOT NULL,
	"state" "app"."lifecycle_state" DEFAULT 'scheduled' NOT NULL,
	"pack_id" uuid,
	"created_by_user_id" uuid,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."lifecycle_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"kind" "app"."lifecycle_task_kind" NOT NULL,
	"key" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"app_id" uuid,
	"tier_id" uuid,
	"grant_id" uuid,
	"hardware_id" uuid,
	"automatic" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"department" text,
	"manager_id" uuid,
	"starts_on" date,
	"leaves_on" date,
	"status" "app"."person_status" DEFAULT 'active' NOT NULL,
	"source" "app"."directory_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"scim_resource" jsonb,
	"absent_until" date,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."people_group_members" (
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "people_group_members_group_id_person_id_pk" PRIMARY KEY("group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "app"."people_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'static' NOT NULL,
	"source" "app"."directory_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"scim_resource" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."provisioning_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"request_id" uuid,
	"action" "app"."provisioning_action" NOT NULL,
	"state" "app"."provisioning_job_state" DEFAULT 'queued' NOT NULL,
	"connector_kind" "app"."connector_kind" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"done_by_user_id" uuid,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."shadow_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"icon_key" text,
	"source" text NOT NULL,
	"users" integer DEFAULT 0 NOT NULL,
	"monthly_spend_cents" integer,
	"risk" "app"."risk_level" DEFAULT 'low' NOT NULL,
	"risk_reason" text,
	"status" "app"."shadow_status" DEFAULT 'new' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."access_approvals" ADD CONSTRAINT "access_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_approvals" ADD CONSTRAINT "access_approvals_request_id_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "app"."access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_approvals" ADD CONSTRAINT "access_approvals_approver_person_id_people_id_fk" FOREIGN KEY ("approver_person_id") REFERENCES "app"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_approvals" ADD CONSTRAINT "access_approvals_on_behalf_of_person_id_people_id_fk" FOREIGN KEY ("on_behalf_of_person_id") REFERENCES "app"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_grants" ADD CONSTRAINT "access_grants_tier_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_requests" ADD CONSTRAINT "access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_requests" ADD CONSTRAINT "access_requests_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_requests" ADD CONSTRAINT "access_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_requests" ADD CONSTRAINT "access_requests_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_requests" ADD CONSTRAINT "access_requests_tier_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_review_items" ADD CONSTRAINT "access_review_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_review_items" ADD CONSTRAINT "access_review_items_review_id_access_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "app"."access_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_review_items" ADD CONSTRAINT "access_review_items_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "app"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_review_items" ADD CONSTRAINT "access_review_items_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "app"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."access_reviews" ADD CONSTRAINT "access_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_app_auto_groups" ADD CONSTRAINT "desk_app_auto_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_app_auto_groups" ADD CONSTRAINT "desk_app_auto_groups_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_app_auto_groups" ADD CONSTRAINT "desk_app_auto_groups_group_id_people_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "app"."people_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_app_tiers" ADD CONSTRAINT "desk_app_tiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_app_tiers" ADD CONSTRAINT "desk_app_tiers_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_apps" ADD CONSTRAINT "desk_apps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_apps" ADD CONSTRAINT "desk_apps_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "app"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_apps" ADD CONSTRAINT "desk_apps_connector_id_desk_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "app"."desk_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_budgets" ADD CONSTRAINT "desk_budgets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_connector_runs" ADD CONSTRAINT "desk_connector_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_connector_runs" ADD CONSTRAINT "desk_connector_runs_connector_id_desk_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "app"."desk_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_connectors" ADD CONSTRAINT "desk_connectors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_delegations" ADD CONSTRAINT "desk_delegations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_delegations" ADD CONSTRAINT "desk_delegations_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_delegations" ADD CONSTRAINT "desk_delegations_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_pack_items" ADD CONSTRAINT "desk_pack_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_pack_items" ADD CONSTRAINT "desk_pack_items_pack_id_desk_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."desk_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_pack_items" ADD CONSTRAINT "desk_pack_items_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_pack_items" ADD CONSTRAINT "desk_pack_items_tier_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_packs" ADD CONSTRAINT "desk_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_settings" ADD CONSTRAINT "desk_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_sod_rules" ADD CONSTRAINT "desk_sod_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_sod_rules" ADD CONSTRAINT "desk_sod_rules_tier_a_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_a_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."desk_sod_rules" ADD CONSTRAINT "desk_sod_rules_tier_b_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_b_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hardware_assets" ADD CONSTRAINT "hardware_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."hardware_assets" ADD CONSTRAINT "hardware_assets_assigned_person_id_people_id_fk" FOREIGN KEY ("assigned_person_id") REFERENCES "app"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_plans" ADD CONSTRAINT "lifecycle_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_plans" ADD CONSTRAINT "lifecycle_plans_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_plans" ADD CONSTRAINT "lifecycle_plans_pack_id_desk_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "app"."desk_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_plans" ADD CONSTRAINT "lifecycle_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_plan_id_lifecycle_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "app"."lifecycle_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_app_id_desk_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "app"."desk_apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_tier_id_desk_app_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "app"."desk_app_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "app"."access_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_hardware_id_hardware_assets_id_fk" FOREIGN KEY ("hardware_id") REFERENCES "app"."hardware_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."lifecycle_tasks" ADD CONSTRAINT "lifecycle_tasks_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people" ADD CONSTRAINT "people_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people_group_members" ADD CONSTRAINT "people_group_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people_group_members" ADD CONSTRAINT "people_group_members_group_id_people_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "app"."people_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people_group_members" ADD CONSTRAINT "people_group_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "app"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."people_groups" ADD CONSTRAINT "people_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "app"."access_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."shadow_findings" ADD CONSTRAINT "shadow_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_approvals_request" ON "app"."access_approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "access_approvals_pending_approver" ON "app"."access_approvals" USING btree ("tenant_id","approver_person_id") WHERE "app"."access_approvals"."decision" = 'pending';--> statement-breakpoint
CREATE INDEX "access_grants_tenant_person" ON "app"."access_grants" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "access_grants_tenant_app" ON "app"."access_grants" USING btree ("tenant_id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_active_person_app" ON "app"."access_grants" USING btree ("tenant_id","person_id","app_id") WHERE "app"."access_grants"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_ticket" ON "app"."access_requests" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "access_requests_tenant_state" ON "app"."access_requests" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "access_requests_tenant_person" ON "app"."access_requests" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "access_review_items_review" ON "app"."access_review_items" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_review_items_review_grant" ON "app"."access_review_items" USING btree ("review_id","grant_id");--> statement-breakpoint
CREATE INDEX "desk_app_tiers_app" ON "app"."desk_app_tiers" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "desk_apps_tenant_slug" ON "app"."desk_apps" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "desk_budgets_tenant_department" ON "app"."desk_budgets" USING btree ("tenant_id","department");--> statement-breakpoint
CREATE INDEX "desk_connector_runs_connector" ON "app"."desk_connector_runs" USING btree ("connector_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desk_packs_tenant_department" ON "app"."desk_packs" USING btree ("tenant_id","department");--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_assets_tenant_tag" ON "app"."hardware_assets" USING btree ("tenant_id","tag");--> statement-breakpoint
CREATE INDEX "lifecycle_plans_due" ON "app"."lifecycle_plans" USING btree ("state","execute_at");--> statement-breakpoint
CREATE INDEX "lifecycle_tasks_plan" ON "app"."lifecycle_tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_tenant_email" ON "app"."people" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "people_tenant_contact" ON "app"."people" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_tenant_external" ON "app"."people" USING btree ("tenant_id","external_id") WHERE "app"."people"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "people_tenant_manager" ON "app"."people" USING btree ("tenant_id","manager_id");--> statement-breakpoint
CREATE INDEX "people_tenant_department" ON "app"."people" USING btree ("tenant_id","department");--> statement-breakpoint
CREATE UNIQUE INDEX "people_groups_tenant_name" ON "app"."people_groups" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "people_groups_tenant_external" ON "app"."people_groups" USING btree ("tenant_id","external_id") WHERE "app"."people_groups"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "provisioning_jobs_state" ON "app"."provisioning_jobs" USING btree ("state","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_findings_tenant_domain" ON "app"."shadow_findings" USING btree ("tenant_id","domain");