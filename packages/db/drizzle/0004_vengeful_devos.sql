ALTER TABLE "app"."tenants" ADD COLUMN "csat_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "csat_sent_at" timestamp with time zone;