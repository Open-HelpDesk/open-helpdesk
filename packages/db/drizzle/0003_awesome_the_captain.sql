ALTER TABLE "app"."tickets" ADD COLUMN "sla_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "sla_breached_at" timestamp with time zone;