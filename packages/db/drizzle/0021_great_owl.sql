CREATE TYPE "app"."import_run_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."import_source" AS ENUM('zendesk', 'freshdesk', 'csv');--> statement-breakpoint
CREATE TABLE "app"."import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" "app"."import_source" NOT NULL,
	"status" "app"."import_run_status" DEFAULT 'pending' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_by_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD COLUMN "import_source" "app"."import_source";--> statement-breakpoint
ALTER TABLE "app"."contacts" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "import_source" "app"."import_source";--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "app"."ticket_messages" ADD COLUMN "import_source" "app"."import_source";--> statement-breakpoint
ALTER TABLE "app"."ticket_messages" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "import_source" "app"."import_source";--> statement-breakpoint
ALTER TABLE "app"."tickets" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "app"."import_runs" ADD CONSTRAINT "import_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."import_runs" ADD CONSTRAINT "import_runs_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_runs_tenant_created" ON "app"."import_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_tenant_import" ON "app"."contacts" USING btree ("tenant_id","import_source","imported_id") WHERE "app"."contacts"."imported_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_tenant_import" ON "app"."organizations" USING btree ("tenant_id","import_source","imported_id") WHERE "app"."organizations"."imported_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tenant_import" ON "app"."ticket_messages" USING btree ("tenant_id","import_source","imported_id") WHERE "app"."ticket_messages"."imported_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_tenant_import" ON "app"."tickets" USING btree ("tenant_id","import_source","imported_id") WHERE "app"."tickets"."imported_id" is not null;