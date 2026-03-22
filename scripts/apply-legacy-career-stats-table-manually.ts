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

async function tableExists(pool: Pool, schema: string, table: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS exists
    `,
    [schema, table]
  );

  return result.rows[0]?.exists ?? false;
}

async function indexExists(pool: Pool, schema: string, indexName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = $1
          AND indexname = $2
      ) AS exists
    `,
    [schema, indexName]
  );

  return result.rows[0]?.exists ?? false;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    console.log("=== legacy_player_career_stats manuell anlegen (idempotent) ===");

    const tableName = "legacy_player_career_stats";
    const tableAlreadyExisted = await tableExists(pool, "public", tableName);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.legacy_player_career_stats (
        id serial PRIMARY KEY,
        player_name text NOT NULL,
        games integer NOT NULL DEFAULT 0,
        goals integer NOT NULL DEFAULT 0,
        assists integer NOT NULL DEFAULT 0,
        points integer NOT NULL DEFAULT 0,
        wins_ratio numeric NOT NULL DEFAULT 0,
        losses_ratio numeric NOT NULL DEFAULT 0,
        hattricks integer NOT NULL DEFAULT 0,
        doublepacks integer NOT NULL DEFAULT 0,
        own_goals integer NOT NULL DEFAULT 0,
        minutes_per_goal integer NOT NULL DEFAULT 0,
        assists_per_game numeric NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    console.log(`[table] public.${tableName}: ${tableAlreadyExisted ? "existierte schon" : "angelegt"}`);

    const indexName = "legacy_player_career_stats_player_name_idx";
    const indexAlreadyExisted = await indexExists(pool, "public", indexName);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS ${indexName}
      ON public.legacy_player_career_stats (player_name)
    `);

    console.log(`[index] ${indexName}: ${indexAlreadyExisted ? "existierte schon" : "angelegt"}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Anlegen der Tabelle fehlgeschlagen:", error);
  process.exit(1);
});
