CREATE TABLE "player_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"badge_key" text NOT NULL,
	"match_id" integer,
	"goal_event_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_goal_event_id_goal_events_id_fk" FOREIGN KEY ("goal_event_id") REFERENCES "public"."goal_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_badges_player_season_badge_uq" ON "player_badges" USING btree ("player_id","season_id","badge_key");--> statement-breakpoint
CREATE INDEX "player_badges_player_id_idx" ON "player_badges" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_badges_season_id_idx" ON "player_badges" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "player_badges_badge_key_idx" ON "player_badges" USING btree ("badge_key");