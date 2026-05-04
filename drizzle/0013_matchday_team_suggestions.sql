CREATE TABLE "matchday_team_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchday_id" integer NOT NULL,
	"algorithm_version" text DEFAULT 'v1_snake_draft' NOT NULL,
	"score_diff" numeric(8, 2) DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchday_team_suggestion_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_side" text NOT NULL,
	"balance_score_at_creation" numeric(8, 2) NOT NULL,
	"player_role_at_creation" text NOT NULL,
	"is_runner_at_creation" boolean DEFAULT false NOT NULL,
	"is_defensive_at_creation" boolean DEFAULT false NOT NULL,
	"is_offensive_at_creation" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matchday_team_suggestion_players_suggestion_player_uq" UNIQUE("suggestion_id", "player_id"),
	CONSTRAINT "matchday_team_suggestion_players_team_side_check" CHECK ("team_side" IN ('team_a', 'team_b')),
	CONSTRAINT "matchday_team_suggestion_players_role_check" CHECK ("player_role_at_creation" IN ('star', 'solid', 'development'))
);
--> statement-breakpoint
ALTER TABLE "matchday_team_suggestions" ADD CONSTRAINT "matchday_team_suggestions_matchday_id_matchdays_id_fk" FOREIGN KEY ("matchday_id") REFERENCES "public"."matchdays"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matchday_team_suggestion_players" ADD CONSTRAINT "matchday_team_suggestion_players_suggestion_id_matchday_team_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."matchday_team_suggestions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matchday_team_suggestion_players" ADD CONSTRAINT "matchday_team_suggestion_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
