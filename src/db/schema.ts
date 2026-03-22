import {
  pgTable,
  pgEnum,
  serial,
  text,
  boolean,
  date,
  integer,
  real,
  timestamp,
} from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teamSideEnum = pgEnum("team_side", ["team_1", "team_2"]);

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchdays = pgTable("matchdays", {
  id: serial("id").primaryKey(),
  matchDate: date("match_date").notNull().unique(),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id),
  mvpPlayerId: integer("mvp_player_id").references(() => players.id, { onDelete: "set null" }),
  matchDate: timestamp("match_date").notNull(),
  team1Name: text("team_1_name").notNull(),
  team2Name: text("team_2_name").notNull(),
  team1Score: integer("team_1_score").notNull().default(0),
  team2Score: integer("team_2_score").notNull().default(0),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchParticipants = pgTable("match_participants", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  teamSide: teamSideEnum("team_side").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchdayParticipants = pgTable("matchday_participants", {
  id: serial("id").primaryKey(),
  matchdayId: integer("matchday_id")
    .notNull()
    .references(() => matchdays.id),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goalEvents = pgTable("goal_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id),
  teamSide: teamSideEnum("team_side").notNull(),
  isOwnGoal: boolean("is_own_goal").notNull().default(false),
  goalType: text("goal_type"),
  scorerPlayerId: integer("scorer_player_id")
    .notNull()
    .references(() => players.id),
  assistPlayerId: integer("assist_player_id").references(() => players.id),
  minute: integer("minute"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchWeather = pgTable("match_weather", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id)
    .unique(),
  temperatureC: real("temperature_c"),
  feelsLikeC: real("feels_like_c"),
  conditionLabel: text("condition_label"),
  precipMm: real("precip_mm"),
  windKmh: real("wind_kmh"),
  humidityPct: integer("humidity_pct"),
  createdAt: timestamp("created_at").defaultNow(),
});