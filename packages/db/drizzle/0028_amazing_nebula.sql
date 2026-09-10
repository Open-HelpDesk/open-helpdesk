ALTER TABLE "app"."whatsapp_messages" ADD COLUMN "template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_settings" ADD COLUMN "template_name" text;--> statement-breakpoint
ALTER TABLE "app"."whatsapp_settings" ADD COLUMN "template_lang" text;