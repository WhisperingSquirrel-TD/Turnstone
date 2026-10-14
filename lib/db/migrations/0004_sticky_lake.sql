CREATE TABLE "game_invites" (
	"game_id" text PRIMARY KEY NOT NULL,
	"link_token_hash" text NOT NULL,
	"short_code_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "game_invites_link_token_hash_unique" UNIQUE("link_token_hash"),
	CONSTRAINT "game_invites_short_code_hash_unique" UNIQUE("short_code_hash")
);
--> statement-breakpoint
CREATE TABLE "game_join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"request_token_hash" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "game_join_requests_request_token_hash_unique" UNIQUE("request_token_hash"),
	CONSTRAINT "game_join_requests_status_check" CHECK ("game_join_requests"."status" in ('pending', 'approved', 'rejected', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_join_requests" ADD CONSTRAINT "game_join_requests_seat_fk" FOREIGN KEY ("game_id","seat_id") REFERENCES "public"."game_seat_access"("game_id","seat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_invites_expiry_idx" ON "game_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "game_join_requests_by_game_idx" ON "game_join_requests" USING btree ("game_id","status");--> statement-breakpoint
CREATE INDEX "game_join_requests_expiry_idx" ON "game_join_requests" USING btree ("expires_at");