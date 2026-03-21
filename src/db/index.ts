import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL_NO_SSL
  );
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  throw new Error(
    "Keine DB-URL gefunden. Setze DATABASE_URL (oder POSTGRES_URL) in den Umgebungsvariablen."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool);