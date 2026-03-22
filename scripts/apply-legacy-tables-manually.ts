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

async function constraintExists(pool: Pool, schema: string, constraintName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = $1
          AND c.conname = $2
      ) AS exists
    `,
    [schema, constraintName]
  );

  return result.rows[0]?.exists ?? false;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    console.log("=== Legacy-Tabellen manuell anlegen (idempotent) ===");

    const statsTableExisted = await tableExists(pool, "public", "legacy_player_match_stats");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.legacy_player_match_stats (
        id serial PRIMARY KEY,
        legacy_source text NOT NULL,
        legacy_event_id integer NOT NULL,
        legacy_player_id integer NOT NULL,
        player_name text NOT NULL,
        match_date timestamp NULL,
        season_label text NULL,
        team_label text NULL,
        opponent_label text NULL,
        games integer NOT NULL DEFAULT 1,
        wins integer NOT NULL DEFAULT 0,
        draws integer NOT NULL DEFAULT 0,
        losses integer NOT NULL DEFAULT 0,
        goals integer NOT NULL DEFAULT 0,
        assists integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log(
      `[table] public.legacy_player_match_stats: ${statsTableExisted ? "existierte schon" : "angelegt"}`
    );

    const mappingTableExisted = await tableExists(pool, "public", "legacy_player_mapping");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.legacy_player_mapping (
        id serial PRIMARY KEY,
        legacy_source text NOT NULL,
        legacy_player_id integer NOT NULL,
        legacy_player_name text NOT NULL,
        player_id integer NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log(
      `[table] public.legacy_player_mapping: ${mappingTableExisted ? "existierte schon" : "angelegt"}`
    );

    const statsIndexName = "legacy_player_match_stats_source_event_player_uq";
    const statsIndexExisted = await indexExists(pool, "public", statsIndexName);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${statsIndexName}
      ON public.legacy_player_match_stats (legacy_source, legacy_event_id, legacy_player_id)
    `);
    console.log(
      `[index] ${statsIndexName}: ${statsIndexExisted ? "existierte schon" : "angelegt"}`
    );

    const mappingIndexName = "legacy_player_mapping_source_player_uq";
    const mappingIndexExisted = await indexExists(pool, "public", mappingIndexName);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${mappingIndexName}
      ON public.legacy_player_mapping (legacy_source, legacy_player_id)
    `);
    console.log(
      `[index] ${mappingIndexName}: ${mappingIndexExisted ? "existierte schon" : "angelegt"}`
    );

    const fkName = "legacy_player_mapping_player_id_players_id_fk";
    const fkExisted = await constraintExists(pool, "public", fkName);
    if (!fkExisted) {
      await pool.query(`
        ALTER TABLE public.legacy_player_mapping
        ADD CONSTRAINT ${fkName}
        FOREIGN KEY (player_id)
        REFERENCES public.players(id)
        ON DELETE SET NULL
      `);
      console.log(`[fk] ${fkName}: angelegt`);
    } else {
      console.log(`[fk] ${fkName}: existierte schon`);
    }

    console.log("\nFertig.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Anlegen der Legacy-Tabellen fehlgeschlagen:", error);
  process.exit(1);
});
