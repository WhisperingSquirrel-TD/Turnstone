CREATE TABLE "game_seat_connections" (
  "connection_id" text PRIMARY KEY NOT NULL,
  "game_id" text NOT NULL,
  "seat_id" text NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_seat_connections" ADD CONSTRAINT "game_seat_connections_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_seat_connections_game_seat_seen_idx" ON "game_seat_connections" USING btree ("game_id","seat_id","last_seen_at");
