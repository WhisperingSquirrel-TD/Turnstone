CREATE TABLE "game_coordinator_delegates" (
	"game_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_coordinator_delegates_game_id_seat_id_pk" PRIMARY KEY("game_id","seat_id")
);
--> statement-breakpoint
CREATE TABLE "game_coordinator_takeover_votes" (
	"request_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"approved" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_coordinator_takeover_votes_request_id_seat_id_pk" PRIMARY KEY("request_id","seat_id")
);
--> statement-breakpoint
CREATE TABLE "game_coordinator_takeovers" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"requester_seat_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "game_coordinator_capabilities" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "game_coordinator_delegates" ADD CONSTRAINT "game_coordinator_delegates_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coordinator_takeover_votes" ADD CONSTRAINT "game_coordinator_takeover_votes_request_id_game_coordinator_takeovers_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."game_coordinator_takeovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_coordinator_takeovers" ADD CONSTRAINT "game_coordinator_takeovers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_coordinator_delegates_seat_idx" ON "game_coordinator_delegates" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "game_coordinator_takeover_votes_seat_idx" ON "game_coordinator_takeover_votes" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "game_coordinator_takeovers_game_idx" ON "game_coordinator_takeovers" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_coordinator_takeovers_expiry_idx" ON "game_coordinator_takeovers" USING btree ("expires_at");