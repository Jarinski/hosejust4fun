import dotenv from "dotenv";
import { asc, eq, isNull } from "drizzle-orm";

dotenv.config({ path: ".env.local" });

async function main() {
  const [{ db }, { matches, matchWeather }, { ensureWeatherStoredForMatch }] = await Promise.all([
    import("../src/db"),
    import("../src/db/schema"),
    import("../src/lib/weather"),
  ]);

  console.log("[start] Fehlende Wetterdaten nachtragen...");

  // Trifft beides: Spiele ganz ohne Wetter-Zeile und Platzhalter-Zeilen aus
  // fehlgeschlagenen Abrufen (temperature_c IS NULL).
  const brokenRows = await db
    .select({ id: matches.id, matchDate: matches.matchDate })
    .from(matches)
    .leftJoin(matchWeather, eq(matchWeather.matchId, matches.id))
    .where(isNull(matchWeather.temperatureC))
    .orderBy(asc(matches.matchDate), asc(matches.id));

  console.log(`[info] Spiele ohne brauchbares Wetter: ${brokenRows.length}`);

  let successCount = 0;
  let errorCount = 0;

  for (const [index, match] of brokenRows.entries()) {
    const position = `${index + 1}/${brokenRows.length}`;
    const dateLabel = match.matchDate.toISOString().slice(0, 10);

    try {
      const weather = await ensureWeatherStoredForMatch(match.id, match.matchDate);

      if (weather.temperatureC === null) {
        errorCount += 1;
        console.warn(`[warn] ${position} Match ${match.id} (${dateLabel}): weiterhin keine Daten.`);
        continue;
      }

      successCount += 1;
      console.log(
        `[ok] ${position} Match ${match.id} (${dateLabel}): ` +
          `${weather.temperatureC}°C, ${weather.conditionLabel}, ${weather.precipMm} mm`,
      );
    } catch (error) {
      errorCount += 1;
      console.error(`[error] ${position} Match ${match.id} (${dateLabel}):`, error);
    }
  }

  console.log(`[done] Nachgetragen: ${successCount}, weiterhin offen: ${errorCount}`);
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
