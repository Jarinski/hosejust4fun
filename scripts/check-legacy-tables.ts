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

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    console.log("=== Legacy Table Diagnose ===");

    const dbInfo = await pool.query<{ current_database: string; current_schema: string }>(
      `SELECT current_database() AS current_database, current_schema() AS current_schema`
    );
    const info = dbInfo.rows[0];

    console.log("\n[1] Aktuelle DB / Schema");
    console.log(`- database: ${info?.current_database ?? "(unbekannt)"}`);
    console.log(`- schema:   ${info?.current_schema ?? "(unbekannt)"}`);

    const legacyTables = await pool.query<{ table_name: string }>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'legacy\\_%' ESCAPE '\\'
        ORDER BY table_name
      `
    );

    console.log("\n[2] Tabellen in public mit Prefix legacy_");
    if (legacyTables.rows.length === 0) {
      console.log("- (keine gefunden)");
    } else {
      for (const row of legacyTables.rows) {
        console.log(`- ${row.table_name}`);
      }
    }

    const statsExists = await tableExists(pool, "public", "legacy_player_match_stats");
    const mappingExists = await tableExists(pool, "public", "legacy_player_mapping");

    console.log("\n[2b] Zieltabellen-Check");
    console.log(`- public.legacy_player_match_stats: ${statsExists ? "OK (vorhanden)" : "FEHLT"}`);
    console.log(`- public.legacy_player_mapping:     ${mappingExists ? "OK (vorhanden)" : "FEHLT"}`);

    const migrationsExists = await tableExists(pool, "public", "__drizzle_migrations");
    console.log("\n[3] __drizzle_migrations vorhanden?");
    console.log(`- ${migrationsExists ? "ja" : "nein"}`);

    console.log("\n[4] Letzte 10 Einträge aus __drizzle_migrations");
    if (!migrationsExists) {
      console.log("- Tabelle nicht vorhanden");
      return;
    }

    const migrationRows = await pool.query<{ id: number | null; hash: string | null; created_at: number | null }>(
      `
        SELECT id, hash, created_at
        FROM "__drizzle_migrations"
        ORDER BY id DESC
        LIMIT 10
      `
    );

    if (migrationRows.rows.length === 0) {
      console.log("- (keine Einträge)");
      return;
    }

    for (const row of migrationRows.rows) {
      const createdAt = row.created_at ? new Date(Number(row.created_at)).toISOString() : "(ohne timestamp)";
      console.log(`- id=${row.id ?? "?"} | hash=${row.hash ?? "?"} | created_at=${createdAt}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Diagnose fehlgeschlagen:", error);
  process.exit(1);
});
