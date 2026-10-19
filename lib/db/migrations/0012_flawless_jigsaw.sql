CREATE TABLE "game_undo_windows" (
	"game_id" text PRIMARY KEY NOT NULL,
	"action_version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invalidated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "game_undo_windows" ADD CONSTRAINT "game_undo_windows_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;