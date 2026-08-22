ALTER TABLE "app"."tenants" ALTER COLUMN "plan" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app"."tenants" ALTER COLUMN "plan" DROP NOT NULL;
