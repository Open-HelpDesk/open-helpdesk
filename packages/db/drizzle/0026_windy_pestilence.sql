CREATE TABLE "app"."ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text,
	"ticket_id" uuid,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text,
	"redactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resolutions" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_deflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid,
	"surface" text NOT NULL,
	"locale" text,
	"question" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'provisional' NOT NULL,
	"ticket_id" uuid,
	"confirm_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"ref_id" text NOT NULL,
	"locale" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"embedding" jsonb,
	"model" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sources" jsonb DEFAULT '{"kb":true,"macros":true,"resolvedTickets":true,"internalNotes":false}'::jsonb NOT NULL,
	"deflection_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deflection_threshold" integer DEFAULT 70 NOT NULL,
	"byo_endpoint" text,
	"byo_model" text,
	"byo_secret" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."ai_calls" ADD CONSTRAINT "ai_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_calls" ADD CONSTRAINT "ai_calls_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_calls" ADD CONSTRAINT "ai_calls_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_credits" ADD CONSTRAINT "ai_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_deflections" ADD CONSTRAINT "ai_deflections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_deflections" ADD CONSTRAINT "ai_deflections_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_deflections" ADD CONSTRAINT "ai_deflections_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_documents" ADD CONSTRAINT "ai_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_settings" ADD CONSTRAINT "ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_tenant_created" ON "app"."ai_calls" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_credits_tenant" ON "app"."ai_credits" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_deflections_tenant_created" ON "app"."ai_deflections" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_deflections_pending" ON "app"."ai_deflections" USING btree ("status","confirm_after");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_documents_ref" ON "app"."ai_documents" USING btree ("tenant_id","source","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_settings_tenant" ON "app"."ai_settings" USING btree ("tenant_id");