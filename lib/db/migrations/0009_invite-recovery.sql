ALTER TABLE "game_invites" ADD COLUMN "recovery_code_hash" text;--> statement-breakpoint
ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_recovery_code_hash_unique" UNIQUE("recovery_code_hash");--> statement-breakpoint
UPDATE "game_invites" SET "recovery_code_hash" = "short_code_hash" WHERE "recovery_code_hash" IS NULL;