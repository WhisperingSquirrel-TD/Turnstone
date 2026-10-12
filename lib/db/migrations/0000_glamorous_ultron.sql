CREATE TABLE "foundation_meta" (
	"id" integer PRIMARY KEY NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
INSERT INTO "foundation_meta" ("id", "version") VALUES (1, 1);
