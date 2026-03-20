CREATE TYPE "public"."team_side" AS ENUM('team_1', 'team_2');--> statement-breakpoint
CREATE TABLE "goal_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"team_side" "team_side" NOT NULL,
	"scorer_player_id" integer NOT NULL,
	"assist_player_id" integer,
	"minute" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_side" "team_side" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_weather" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"temperature_c" real,
	"feels_like_c" real,
	"condition_label" text,
	"precip_mm" real,
	"wind_kmh" real,
	"humidity_pct" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "match_weather_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"match_date" timestamp NOT NULL,
	"team_1_name" text NOT NULL,
	"team_2_name" text NOT NULL,
	"team_1_score" integer DEFAULT 0 NOT NULL,
	"team_2_score" integer DEFAULT 0 NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_scorer_player_id_players_id_fk" FOREIGN KEY ("scorer_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_events" ADD CONSTRAINT "goal_events_assist_player_id_players_id_fk" FOREIGN KEY ("assist_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_weather" ADD CONSTRAINT "match_weather_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;