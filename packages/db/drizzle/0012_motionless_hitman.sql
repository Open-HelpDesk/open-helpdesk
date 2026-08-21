ALTER TABLE "app"."tenants" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."tenants" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."tenants" ADD COLUMN "entitlements" jsonb;--> statement-breakpoint
ALTER TABLE "app"."tenants" ADD COLUMN "plan_name" text;--> statement-breakpoint
ALTER TABLE "app"."tenants" ADD COLUMN "billing" jsonb;