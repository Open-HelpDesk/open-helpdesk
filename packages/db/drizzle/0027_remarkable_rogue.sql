ALTER TYPE "app"."ticket_channel" ADD VALUE 'whatsapp';--> statement-breakpoint
CREATE TABLE "app"."whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wa_id" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"active_ticket_id" uuid,
	"last_inbound_at" timestamp with time zone,
	"profile_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"wamid" text NOT NULL,
	"direction" text NOT NULL,
	"ticket_id" uuid,
	"message_id" uuid,
	"status" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."whatsapp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_phone" text,
	"waba_id" text,
	"encrypted_secrets" text,
	"secret_hint" text,
	"default_team_id" uuid,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_settings_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "whatsapp_settings_phone_number_id_unique" UNIQUE("phone_number_id")
);
--> statement-breakpoint
ALTER TABLE "app"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_active_ticket_id_tickets_id_fk" FOREIGN KEY ("active_ticket_id") REFERENCES "app"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_message_id_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."ticket_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_default_team_id_teams_id_fk" FOREIGN KEY ("default_team_id") REFERENCES "app"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversations_tenant_wa" ON "app"."whatsapp_conversations" USING btree ("tenant_id","wa_id");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_tenant_contact" ON "app"."whatsapp_conversations" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_tenant_wamid" ON "app"."whatsapp_messages" USING btree ("tenant_id","wamid");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_tenant_ticket" ON "app"."whatsapp_messages" USING btree ("tenant_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_settings_tenant" ON "app"."whatsapp_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_settings_phone_number" ON "app"."whatsapp_settings" USING btree ("phone_number_id");