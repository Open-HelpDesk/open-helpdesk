CREATE TYPE "app"."device_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "app"."device_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hashed_code" text NOT NULL,
	"code_challenge" text NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."device_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hashed_token" text NOT NULL,
	"device_name" text,
	"platform" "app"."device_platform",
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid,
	"user_id" uuid,
	"contact_id" uuid,
	"platform" "app"."device_platform" NOT NULL,
	"push_token" text NOT NULL,
	"device_name" text,
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."device_auth_codes" ADD CONSTRAINT "device_auth_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."device_auth_codes" ADD CONSTRAINT "device_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ADD CONSTRAINT "device_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."push_devices" ADD CONSTRAINT "push_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "app"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."push_devices" ADD CONSTRAINT "push_devices_session_id_device_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "app"."device_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."push_devices" ADD CONSTRAINT "push_devices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "app"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_auth_codes_code" ON "app"."device_auth_codes" USING btree ("hashed_code");--> statement-breakpoint
CREATE UNIQUE INDEX "device_sessions_token" ON "app"."device_sessions" USING btree ("hashed_token");--> statement-breakpoint
CREATE INDEX "device_sessions_user" ON "app"."device_sessions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_tenant_token" ON "app"."push_devices" USING btree ("tenant_id","push_token");--> statement-breakpoint
CREATE INDEX "push_devices_user" ON "app"."push_devices" USING btree ("tenant_id","user_id");