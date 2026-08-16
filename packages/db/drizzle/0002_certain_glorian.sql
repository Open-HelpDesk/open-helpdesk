CREATE TYPE "app"."mailbox_kind" AS ENUM('provided', 'forwarding', 'imap');--> statement-breakpoint
CREATE TABLE "app"."mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"address" text NOT NULL,
	"kind" "app"."mailbox_kind" DEFAULT 'provided' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"sender_name" text,
	"signature_html" text,
	"default_team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD CONSTRAINT "mailboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD CONSTRAINT "mailboxes_default_team_id_teams_id_fk" FOREIGN KEY ("default_team_id") REFERENCES "app"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_address" ON "app"."mailboxes" USING btree ("address");