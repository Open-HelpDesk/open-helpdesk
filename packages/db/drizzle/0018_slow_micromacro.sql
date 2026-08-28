CREATE TYPE "app"."resolution_cause" AS ENUM('product_bug', 'configuration', 'user_error', 'third_party', 'duplicate', 'no_fault_found');--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "resolution_cause" "app"."resolution_cause";--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "resolution_article_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "resolution_send_csat" boolean DEFAULT true NOT NULL;