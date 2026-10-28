ALTER TABLE "games" ADD COLUMN "game_end_date" date;
--> statement-breakpoint
UPDATE "games"
SET "game_end_date" = (("created_at" AT TIME ZONE 'Europe/London')::date + 30)
WHERE "game_end_date" IS NULL
  AND coalesce("config" #>> '{rehearsal,enabled}', 'false') <> 'true';
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_end_date_required_check" CHECK ("game_end_date" IS NOT NULL OR coalesce("config" #>> '{rehearsal,enabled}', 'false') = 'true');
--> statement-breakpoint
CREATE INDEX "games_end_date_idx" ON "games" USING btree ("game_end_date");
--> statement-breakpoint
CREATE TABLE "game_tombstones" (
  "game_id" text PRIMARY KEY NOT NULL,
  "deleted_on" date NOT NULL,
  "reason" text NOT NULL,
  CONSTRAINT "game_tombstones_reason_check" CHECK ("reason" in ('end_date_passed', 'practice_inactive'))
);
