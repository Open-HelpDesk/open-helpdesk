CREATE TABLE "app"."ticket_reads" (
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_reads_ticket_id_user_id_pk" PRIMARY KEY("ticket_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "app"."ticket_reads" ADD CONSTRAINT "ticket_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_reads" ADD CONSTRAINT "ticket_reads_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "app"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ticket_reads" ADD CONSTRAINT "ticket_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_reads_agent" ON "app"."ticket_reads" USING btree ("tenant_id","user_id");