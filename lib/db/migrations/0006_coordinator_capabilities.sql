CREATE TABLE "game_coordinator_capabilities" (
	"game_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"holder_seat_id" text,
	"account_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_coordinator_capabilities_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "game_coordinator_capabilities" ADD CONSTRAINT "game_coordinator_capabilities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_coordinator_capabilities_expiry_idx" ON "game_coordinator_capabilities" USING btree ("expires_at");