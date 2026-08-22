-- The ticket-type vocabulary offered by the picker becomes English. Carrying the
-- two renamed values over keeps existing tickets selected in that picker — and
-- keeps their DISPLAY unchanged in every language, since the dictionary
-- translates the value.
UPDATE "app"."tickets" SET "type" = 'Task' WHERE "type" = 'Tâche';--> statement-breakpoint
UPDATE "app"."tickets" SET "type" = 'Other' WHERE "type" = 'Autre';
