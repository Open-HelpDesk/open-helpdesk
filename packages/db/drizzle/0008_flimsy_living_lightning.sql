ALTER TABLE "app"."mailboxes" ADD COLUMN "form_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "imap_host" text;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "imap_port" integer;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "imap_secure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "imap_user" text;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "encrypted_secrets" text;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD COLUMN "sync_error" text;--> statement-breakpoint
ALTER TABLE "app"."mailboxes" ADD CONSTRAINT "mailboxes_form_id_ticket_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "app"."ticket_forms"("id") ON DELETE no action ON UPDATE no action;