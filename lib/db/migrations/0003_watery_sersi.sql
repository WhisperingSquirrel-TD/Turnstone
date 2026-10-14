CREATE TABLE "game_seat_access" (
	"game_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"pin_salt" text NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_pin_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_seat_access_game_id_seat_id_pk" PRIMARY KEY("game_id","seat_id"),
	CONSTRAINT "game_seat_access_failed_pin_attempts_check" CHECK ("game_seat_access"."failed_pin_attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "game_viewer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_seat_access" ADD CONSTRAINT "game_seat_access_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_viewer_sessions" ADD CONSTRAINT "game_viewer_sessions_seat_fk" FOREIGN KEY ("game_id","seat_id") REFERENCES "public"."game_seat_access"("game_id","seat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_viewer_sessions_by_seat_idx" ON "game_viewer_sessions" USING btree ("game_id","seat_id");--> statement-breakpoint
CREATE INDEX "game_viewer_sessions_expiry_idx" ON "game_viewer_sessions" USING btree ("expires_at");