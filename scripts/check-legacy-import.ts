import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });

const DATABASE_URL_CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
] as const;

function resolveDatabaseUrl(): string {
  for (const key of DATABASE_URL_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Keine DB-URL gefunden. Setze eine dieser Variablen: ${DATABASE_URL_CANDIDATES.join(", ")}.`
  );
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    console.log("=== Legacy-Import Diagnose ===");

    const statsSummary = await pool.query<{
      total_rows: string;
      distinct_events: string;
      distinct_players: string;
      total_games: string;
      total_wins: string;
      total_draws: string;
      total_losses: string;
      total_goals: string;
      total_assists: string;
    }>(`
      SELECT
        COUNT(*)::text AS total_rows,
        COUNT(DISTINCT legacy_event_id)::text AS distinct_events,
        COUNT(DISTINCT legacy_player_id)::text AS distinct_players,
        COALESCE(SUM(games), 0)::text AS total_games,
        COALESCE(SUM(wins), 0)::text AS total_wins,
        COALESCE(SUM(draws), 0)::text AS total_draws,
        COALESCE(SUM(losses), 0)::text AS total_losses,
        COALESCE(SUM(goals), 0)::text AS total_goals,
        COALESCE(SUM(assists), 0)::text AS total_assists
      FROM legacy_player_match_stats
    `);

    const s = statsSummary.rows[0];
    console.log("\n[legacy_player_match_stats] Überblick");
    console.table([
      {
        total_rows: Number(s?.total_rows ?? 0),
        distinct_legacy_event_id: Number(s?.distinct_events ?? 0),
        distinct_legacy_player_id: Number(s?.distinct_players ?? 0),
        sum_games: Number(s?.total_games ?? 0),
        sum_wins: Number(s?.total_wins ?? 0),
        sum_draws: Number(s?.total_draws ?? 0),
        sum_losses: Number(s?.total_losses ?? 0),
        sum_goals: Number(s?.total_goals ?? 0),
        sum_assists: Number(s?.total_assists ?? 0),
      },
    ]);

    const topGoals = await pool.query<{
      legacy_player_id: number;
      player_name: string;
      goals: string;
      assists: string;
      games: string;
    }>(`
      SELECT
        legacy_player_id,
        MIN(player_name) AS player_name,
        SUM(goals)::text AS goals,
        SUM(assists)::text AS assists,
        SUM(games)::text AS games
      FROM legacy_player_match_stats
      GROUP BY legacy_player_id
      ORDER BY SUM(goals) DESC, SUM(assists) DESC, MIN(player_name) ASC
      LIMIT 15
    `);

    console.log("\nTop 15 nach Goals");
    console.table(
      topGoals.rows.map((row) => ({
        legacy_player_id: row.legacy_player_id,
        player_name: row.player_name,
        goals: Number(row.goals),
        assists: Number(row.assists),
        games: Number(row.games),
      }))
    );

    const topAssists = await pool.query<{
      legacy_player_id: number;
      player_name: string;
      assists: string;
      goals: string;
      games: string;
    }>(`
      SELECT
        legacy_player_id,
        MIN(player_name) AS player_name,
        SUM(assists)::text AS assists,
        SUM(goals)::text AS goals,
        SUM(games)::text AS games
      FROM legacy_player_match_stats
      GROUP BY legacy_player_id
      ORDER BY SUM(assists) DESC, SUM(goals) DESC, MIN(player_name) ASC
      LIMIT 15
    `);

    console.log("\nTop 15 nach Assists");
    console.table(
      topAssists.rows.map((row) => ({
        legacy_player_id: row.legacy_player_id,
        player_name: row.player_name,
        assists: Number(row.assists),
        goals: Number(row.goals),
        games: Number(row.games),
      }))
    );

    const topGames = await pool.query<{
      legacy_player_id: number;
      player_name: string;
      games: string;
      goals: string;
      assists: string;
    }>(`
      SELECT
        legacy_player_id,
        MIN(player_name) AS player_name,
        SUM(games)::text AS games,
        SUM(goals)::text AS goals,
        SUM(assists)::text AS assists
      FROM legacy_player_match_stats
      GROUP BY legacy_player_id
      ORDER BY SUM(games) DESC, SUM(goals) DESC, MIN(player_name) ASC
      LIMIT 15
    `);

    console.log("\nTop 15 nach Games");
    console.table(
      topGames.rows.map((row) => ({
        legacy_player_id: row.legacy_player_id,
        player_name: row.player_name,
        games: Number(row.games),
        goals: Number(row.goals),
        assists: Number(row.assists),
      }))
    );

    const mappingSummary = await pool.query<{
      total_rows: string;
      with_player_id: string;
      without_player_id: string;
    }>(`
      SELECT
        COUNT(*)::text AS total_rows,
        COUNT(*) FILTER (WHERE player_id IS NOT NULL)::text AS with_player_id,
        COUNT(*) FILTER (WHERE player_id IS NULL)::text AS without_player_id
      FROM legacy_player_mapping
    `);

    const m = mappingSummary.rows[0];
    console.log("\n[legacy_player_mapping] Überblick");
    console.table([
      {
        total_rows: Number(m?.total_rows ?? 0),
        with_player_id: Number(m?.with_player_id ?? 0),
        without_player_id: Number(m?.without_player_id ?? 0),
      },
    ]);

    const unmapped = await pool.query<{
      legacy_player_id: number;
      legacy_player_name: string;
    }>(`
      SELECT legacy_player_id, legacy_player_name
      FROM legacy_player_mapping
      WHERE player_id IS NULL
      ORDER BY legacy_player_name ASC, legacy_player_id ASC
      LIMIT 15
    `);

    console.log("\nOptional: 15 Legacy-Spieler ohne player_id (alphabetisch)");
    if (unmapped.rows.length === 0) {
      console.log("- Keine offenen Mapping-Einträge ohne player_id.");
    } else {
      console.table(unmapped.rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Legacy-Import-Diagnose fehlgeschlagen:", error);
  process.exit(1);
});
