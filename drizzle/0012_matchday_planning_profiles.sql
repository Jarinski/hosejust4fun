CREATE TABLE "player_planning_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"is_runner" boolean DEFAULT false NOT NULL,
	"is_defensive" boolean DEFAULT false NOT NULL,
	"is_offensive" boolean DEFAULT false NOT NULL,
	"is_weak_player" boolean DEFAULT false NOT NULL,
	"is_star_player" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "player_planning_profiles_player_id_uq" UNIQUE("player_id")
);
--> statement-breakpoint
ALTER TABLE "player_planning_profiles" ADD CONSTRAINT "player_planning_profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "player_planning_profiles_player_id_idx" ON "player_planning_profiles" USING btree ("player_id");