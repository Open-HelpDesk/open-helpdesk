CREATE TYPE "app"."email_delivery_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "app"."mail_provider" AS ENUM('console', 'smtp', 'resend', 'brevo', 'mailjet');--> statement-breakpoint
CREATE TYPE "app"."mail_test_status" AS ENUM('untested', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "app"."email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"provider" "app"."mail_provider" NOT NULL,
	"status" "app"."email_delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."email_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" "app"."mail_provider" DEFAULT 'console' NOT NULL,
	"from_name" text,
	"from_address" text,
	"reply_to" text,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_user" text,
	"encrypted_secrets" text,
	"secret_hint" text,
	"test_status" "app"."mail_test_status" DEFAULT 'untested' NOT NULL,
	"test_error" text,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "app"."email_deliveries" ADD CONSTRAINT "email_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."email_settings" ADD CONSTRAINT "email_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_deliveries_tenant_created" ON "app"."email_deliveries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_settings_tenant" ON "app"."email_settings" USING btree ("tenant_id");