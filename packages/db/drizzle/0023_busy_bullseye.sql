ALTER TABLE "app"."device_auth_codes" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."device_auth_codes" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."device_auth_codes" ADD CONSTRAINT "device_auth_codes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ADD CONSTRAINT "device_sessions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_sessions_contact" ON "app"."device_sessions" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "push_devices_contact" ON "app"."push_devices" USING btree ("tenant_id","contact_id");--> statement-breakpoint
ALTER TABLE "app"."device_auth_codes" ADD CONSTRAINT "device_auth_codes_one_owner" CHECK (("app"."device_auth_codes"."user_id" is null) <> ("app"."device_auth_codes"."contact_id" is null));--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ADD CONSTRAINT "device_sessions_one_owner" CHECK (("app"."device_sessions"."user_id" is null) <> ("app"."device_sessions"."contact_id" is null));--> statement-breakpoint
ALTER TABLE "app"."push_devices" ADD CONSTRAINT "push_devices_one_owner" CHECK (("app"."push_devices"."user_id" is null) <> ("app"."push_devices"."contact_id" is null));