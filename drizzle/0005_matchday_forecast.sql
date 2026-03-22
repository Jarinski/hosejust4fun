CREATE TABLE "matchdays" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_date" date NOT NULL,
	"location" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "matchdays_match_date_unique" UNIQUE("match_date")
);
--> statement-breakpoint
CREATE TABLE "matchday_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchday_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "matchday_participants" ADD CONSTRAINT "matchday_participants_matchday_id_matchdays_id_fk" FOREIGN KEY ("matchday_id") REFERENCES "public"."matchdays"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matchday_participants" ADD CONSTRAINT "matchday_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;