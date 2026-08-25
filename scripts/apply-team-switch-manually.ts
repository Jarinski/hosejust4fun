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

// Fallback-Spiellänge für Segmente ohne Endminute. Wird nur zur Gewichtung
// der Spielzeit benutzt, nicht als fachliche Spieldauer.
const ASSUMED_MATCH_MINUTES = 90;

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

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [table, column]
  );

  return result.rows[0]?.exists ?? false;
}

async function indexExists(pool: Pool, indexName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1
      ) AS exists
    `,
    [indexName]
  );

  return result.rows[0]?.exists ?? false;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    console.log("=== Teamwechsel-Schema anwenden (idempotent) ===");

    const fromExisted = await columnExists(pool, "match_participants", "from_minute");
    await pool.query(`
      ALTER TABLE public.match_participants
      ADD COLUMN IF NOT EXISTS from_minute integer NOT NULL DEFAULT 0
    `);
    console.log(`[column] from_minute: ${fromExisted ? "existierte schon" : "angelegt"}`);

    const toExisted = await columnExists(pool, "match_participants", "to_minute");
    await pool.query(`
      ALTER TABLE public.match_participants
      ADD COLUMN IF NOT EXISTS to_minute integer
    `);
    console.log(`[column] to_minute: ${toExisted ? "existierte schon" : "angelegt"}`);

    // Schützt die Invariante, die bisher nur im Anwendungscode lebte:
    // pro Spiel und Spieler darf es je Startminute nur einen Abschnitt geben.
    const indexName = "match_participants_match_player_from_uq";
    const indexExisted = await indexExists(pool, indexName);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
      ON public.match_participants (match_id, player_id, from_minute)
    `);
    console.log(`[index] ${indexName}: ${indexExisted ? "existierte schon" : "angelegt"}`);

    // Genau eine Zeile pro (Spiel, Spieler): die Seite mit der meisten
    // Spielzeit. Bei Gleichstand entscheidet die kleinere id, also die
    // zuerst erfasste Zeile — das ist die Startseite.
    await pool.query(`
      CREATE OR REPLACE VIEW public.match_participant_primary AS
      SELECT DISTINCT ON (match_id, player_id)
        id,
        match_id,
        player_id,
        team_side,
        created_at
      FROM public.match_participants
      ORDER BY
        match_id,
        player_id,
        (COALESCE(to_minute, ${ASSUMED_MATCH_MINUTES}) - from_minute) DESC,
        id ASC
    `);
    console.log("[view] match_participant_primary: angelegt/aktualisiert");

    const check = await pool.query<{ tabelle: number; view: number }>(`
      SELECT
        (SELECT count(*) FROM public.match_participants)::int AS tabelle,
        (SELECT count(*) FROM public.match_participant_primary)::int AS view
    `);
    const { tabelle, view } = check.rows[0];
    console.log(`\n[check] Zeilen in match_participants: ${tabelle}`);
    console.log(`[check] Zeilen in match_participant_primary: ${view}`);
    console.log(
      tabelle === view
        ? "[check] Identisch — aktuell gibt es keine Teamwechsel, Statistiken bleiben unverändert."
        : `[check] Differenz ${tabelle - view}: so viele zusätzliche Wechsel-Abschnitte sind erfasst.`
    );

    console.log("\nFertig.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Teamwechsel-Schema konnte nicht angewendet werden:", error);
  process.exit(1);
});
