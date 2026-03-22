CREATE TABLE "legacy_player_career_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_name" text NOT NULL,
	"games" integer NOT NULL,
	"goals" integer NOT NULL,
	"assists" integer NOT NULL,
	"points" integer NOT NULL,
	"wins_ratio" numeric,
	"losses_ratio" numeric,
	"hattricks" integer NOT NULL,
	"doublepacks" integer NOT NULL,
	"own_goals" integer NOT NULL,
	"minutes_per_goal" integer NOT NULL
);
