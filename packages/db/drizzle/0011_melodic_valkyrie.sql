DROP TABLE "cloud"."cloud_tenants" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."console_audit_events" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."console_users" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."dunning_cases" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."feature_flag_overrides" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."feature_flags" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."incidents" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."invoices" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."plans" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."provisioning_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "cloud"."usage_records" CASCADE;--> statement-breakpoint
DROP TYPE "cloud"."cloud_tenant_status";--> statement-breakpoint
DROP TYPE "cloud"."console_role";--> statement-breakpoint
DROP TYPE "cloud"."flag_state";--> statement-breakpoint
DROP TYPE "cloud"."incident_severity";--> statement-breakpoint
DROP TYPE "cloud"."incident_status";--> statement-breakpoint
DROP TYPE "cloud"."job_status";--> statement-breakpoint
DROP TYPE "cloud"."provisioning_kind";--> statement-breakpoint
DROP SCHEMA "cloud";
