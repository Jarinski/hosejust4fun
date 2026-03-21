const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL fehlt in .env.local");
  process.exit(1);
}

const inputPlayers = [
  "Andreas Weseloh",
  "Bjarne Adam",
  "Björn Steinhardt",
  "Carsten Warratz",
  "Christian Bartz",
  "Christian Junge",
  "Christian Krause",
  "Christian Stille",
  "Felix Kroppenstedt",
  "Florian Wiards",
  "Jari Gonzales",
  "Jens Mergenthal",
  "Jörg Paßlack",
  "Kiri Papouloglou",
  "Lars Finck",
  "Lars Flemke",
  "Lars Follmann",
  "Marcus Schünzel",
  "Marvin Duda",
  "Michael Blümig",
  "Michael Schönherr",
  "Norbert Riebesehl",
  "Olaf Steinitz",
  "Stephan Ebel",
  "Sven Lehmann",
  "Thomas Ullrich",
  "Till Romainschick",
  "Tim Breckwoldt",
  "Torsten Krüger",
  "Wolfgang Hübsch",
];

function normalizeInputNames(names) {
  const seen = new Set();
  const result = [];

  for (const raw of names) {
    const name = String(raw).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }

  return result;
}

async function runImport() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const candidateNames = normalizeInputNames(inputPlayers);

  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE players IN SHARE ROW EXCLUSIVE MODE");

    const existingRes = await client.query("SELECT name FROM players");
    const existingSet = new Set(existingRes.rows.map((row) => row.name));

    const alreadyExisting = candidateNames.filter((name) => existingSet.has(name));
    const missing = candidateNames.filter((name) => !existingSet.has(name));

    if (missing.length > 0) {
      const valuePlaceholders = missing.map((_, i) => `($${i + 1}, true)`).join(", ");
      await client.query(
        `INSERT INTO players (name, is_active) VALUES ${valuePlaceholders}`,
        missing
      );
    }

    await client.query("COMMIT");

    return {
      totalCandidates: candidateNames.length,
      createdCount: missing.length,
      existingCount: alreadyExisting.length,
      alreadyExisting,
      created: missing,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

runImport()
  .then((summary) => {
    console.log("Spieler-Import abgeschlossen.");
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error("Fehler beim Spieler-Import:", error.message);
    process.exit(1);
  });