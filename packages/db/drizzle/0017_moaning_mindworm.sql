CREATE TYPE "app"."ticket_link_relation" AS ENUM('related', 'duplicate', 'incident');--> statement-breakpoint
CREATE TABLE "app"."contact_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ticket_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"linked_ticket_id" uuid NOT NULL,
	"relation" "app"."ticket_link_relation" DEFAULT 'related' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."ticket_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"label" text NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."users" ADD COLUMN "notifications_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."contact_notes" ADD CONSTRAINT "contact_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_notes" ADD CONSTRAINT "contact_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."contact_notes" ADD CONSTRAINT "contact_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_links" ADD CONSTRAINT "ticket_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_links" ADD CONSTRAINT "ticket_links_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_links" ADD CONSTRAINT "ticket_links_linked_ticket_id_tickets_id_fk" FOREIGN KEY ("linked_ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_links" ADD CONSTRAINT "ticket_links_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_tasks" ADD CONSTRAINT "ticket_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_tasks" ADD CONSTRAINT "ticket_tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_tasks" ADD CONSTRAINT "ticket_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_tasks" ADD CONSTRAINT "ticket_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_notes_tenant_contact" ON "app"."contact_notes" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "ticket_links_tenant_ticket" ON "app"."ticket_links" USING btree ("tenant_id","ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_links_tenant_linked" ON "app"."ticket_links" USING btree ("tenant_id","linked_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_links_pair" ON "app"."ticket_links" USING btree ("tenant_id","ticket_id","linked_ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_tasks_tenant_ticket" ON "app"."ticket_tasks" USING btree ("tenant_id","ticket_id");