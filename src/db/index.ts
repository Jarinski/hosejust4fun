import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

function createPool(): Pool {
  if (!databaseUrl) {
    const missingUrlError =
      "DATABASE_URL fehlt. Runtime-DB-Verbindung benötigt DATABASE_URL.";

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

  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;

    if (process.env.NODE_ENV === "production" && (host === "localhost" || host === "127.0.0.1")) {
      throw new Error("Ungültige DATABASE_URL in Production: localhost/127.0.0.1 ist nicht erlaubt.");
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Ungültige DATABASE_URL: keine gültige URL.");
    }

    throw error;
  }

  return new Pool({
    connectionString: databaseUrl,
  });
}

const pool = createPool();

export const db = drizzle(pool);