CREATE TABLE "game_presenter_pairings" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_presenter_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_presenter_pairings" ADD CONSTRAINT "game_presenter_pairings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_presenter_sessions" ADD CONSTRAINT "game_presenter_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_presenter_pairings_by_game_idx" ON "game_presenter_pairings" USING btree ("game_id","expires_at");--> statement-breakpoint
CREATE INDEX "game_presenter_sessions_by_game_idx" ON "game_presenter_sessions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_presenter_sessions_expiry_idx" ON "game_presenter_sessions" USING btree ("expires_at");