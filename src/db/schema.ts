import {
  pgTable,
  pgEnum,
  uniqueIndex,
  serial,
  text,
  boolean,
  date,
  integer,
  numeric,
  real,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  isGoalkeeper: boolean("is_goalkeeper").notNull().default(false),
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
  isCanceled: boolean("is_canceled").notNull().default(false),
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

export const legacyPlayerMatchStats = pgTable(
  "legacy_player_match_stats",
  {
    id: serial("id").primaryKey(),
    legacySource: text("legacy_source").notNull(),
    legacyEventId: integer("legacy_event_id").notNull(),
    legacyPlayerId: integer("legacy_player_id").notNull(),
    playerName: text("player_name").notNull(),
    matchDate: date("match_date"),
    seasonLabel: text("season_label").notNull(),
    teamLabel: text("team_label").notNull(),
    opponentLabel: text("opponent_label"),
    games: integer("games").notNull().default(1),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueLegacyEventPlayer: uniqueIndex("legacy_player_match_stats_source_event_player_uq").on(
      table.legacySource,
      table.legacyEventId,
      table.legacyPlayerId
    ),
  })
);

export const legacyPlayerMapping = pgTable(
  "legacy_player_mapping",
  {
    id: serial("id").primaryKey(),
    legacySource: text("legacy_source").notNull(),
    legacyPlayerId: integer("legacy_player_id").notNull(),
    legacyPlayerName: text("legacy_player_name").notNull(),
    playerId: integer("player_id").references(() => players.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueLegacyPlayer: uniqueIndex("legacy_player_mapping_source_player_uq").on(
      table.legacySource,
      table.legacyPlayerId
    ),
  })
);

export const legacyPlayerCareerStats = pgTable("legacy_player_career_stats", {
  id: uuid("id").primaryKey(),
  playerName: text("player_name").notNull(),
  games: integer("games").notNull(),
  goals: integer("goals").notNull(),
  assists: integer("assists").notNull(),
  points: integer("points").notNull(),
  winsRatio: numeric("wins_ratio"),
  lossesRatio: numeric("losses_ratio"),
  hattricks: integer("hattricks").notNull(),
  doublepacks: integer("doublepacks").notNull(),
  ownGoals: integer("own_goals").notNull(),
  minutesPerGoal: integer("minutes_per_goal").notNull(),
});