CREATE TABLE "legacy_player_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_source" text NOT NULL,
	"legacy_player_id" integer NOT NULL,
	"legacy_player_name" text NOT NULL,
	"player_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "legacy_player_match_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_source" text NOT NULL,
	"legacy_event_id" integer NOT NULL,
	"legacy_player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"match_date" date,
	"season_label" text NOT NULL,
	"team_label" text NOT NULL,
	"opponent_label" text,
	"games" integer DEFAULT 1 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "legacy_player_mapping" ADD CONSTRAINT "legacy_player_mapping_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_player_mapping_source_player_uq" ON "legacy_player_mapping" USING btree ("legacy_source","legacy_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_player_match_stats_source_event_player_uq" ON "legacy_player_match_stats" USING btree ("legacy_source","legacy_event_id","legacy_player_id");