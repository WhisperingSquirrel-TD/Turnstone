CREATE TABLE "game_deadlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"claimed_until" timestamp with time zone,
	"claim_token" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"game_id" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
CREATE TABLE "game_idempotency" (
	"game_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"resulting_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_idempotency_game_id_actor_id_key_pk" PRIMARY KEY("game_id","actor_id","key")
);
--> statement-breakpoint
CREATE TABLE "game_snapshots" (
	"game_id" text NOT NULL,
	"seq" integer NOT NULL,
	"state" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_snapshots_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_deadlines" ADD CONSTRAINT "game_deadlines_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_idempotency" ADD CONSTRAINT "game_idempotency_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_snapshots" ADD CONSTRAINT "game_snapshots_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_deadlines_due_idx" ON "game_deadlines" USING btree ("completed_at","due_at","claimed_until");