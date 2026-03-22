import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const DATABASE_URL_CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
] as const;

const SSL_MODES_ALIASED_TO_VERIFY_FULL = new Set(["prefer", "require", "verify-ca"]);

function resolveDatabaseUrl() {
  for (const key of DATABASE_URL_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function createPool(): Pool {
  const rawDatabaseUrl = resolveDatabaseUrl();

  if (!rawDatabaseUrl) {
    const missingUrlError = `Keine DB-URL gefunden. Setze eine dieser Variablen: ${DATABASE_URL_CANDIDATES.join(
      ", "
    )}.`;

    const failingPool = {
      query: async () => {
        throw new Error(missingUrlError);
      },
      connect: async () => {
        throw new Error(missingUrlError);
      },
      end: async () => undefined,
    };

    return failingPool as unknown as Pool;
  }

  let normalizedDatabaseUrl = rawDatabaseUrl;

  try {
    const parsed = new URL(rawDatabaseUrl);
    const host = parsed.hostname;

    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const useLibpqCompat = parsed.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";

    if (sslMode && SSL_MODES_ALIASED_TO_VERIFY_FULL.has(sslMode) && !useLibpqCompat) {
      parsed.searchParams.set("sslmode", "verify-full");
      normalizedDatabaseUrl = parsed.toString();
    }

    if (
      process.env.NODE_ENV === "production" &&
      (host === "localhost" || host === "127.0.0.1")
    ) {
      throw new Error("Ungültige DATABASE_URL in Production: localhost/127.0.0.1 ist nicht erlaubt.");
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Ungültige DATABASE_URL: keine gültige URL.");
    }

    throw error;
  }

  return new Pool({
    connectionString: normalizedDatabaseUrl,
  });
}

const pool = createPool();

export const db = drizzle(pool);