CREATE TABLE "game_coordinator_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"target_seat_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_coordinator_handoffs_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "game_coordinator_handoffs" ADD CONSTRAINT "game_coordinator_handoffs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_coordinator_handoffs_game_idx" ON "game_coordinator_handoffs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_coordinator_handoffs_expiry_idx" ON "game_coordinator_handoffs" USING btree ("expires_at");