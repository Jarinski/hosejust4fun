import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { matches, matchWeather, players, seasons } from "@/src/db/schema";
import { ensureWeatherStoredForMatch } from "@/src/lib/weather";

export default async function MatchesPage() {
  let weatherTableAvailable = true;
  let allMatches: Array<{
    id: number;
    matchDate: Date;
    seasonName: string | null;
    team1Name: string;
    team2Name: string;
    mvpName: string | null;
    weatherCondition: string | null;
    weatherTemperatureC: number | null;
    weatherPrecipMm: number | null;
  }> = [];

  try {
    allMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        mvpName: players.name,
        weatherCondition: matchWeather.conditionLabel,
        weatherTemperatureC: matchWeather.temperatureC,
        weatherPrecipMm: matchWeather.precipMm,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(players, eq(matches.mvpPlayerId, players.id))
      .leftJoin(matchWeather, eq(matchWeather.matchId, matches.id))
      .orderBy(desc(matches.matchDate));
  } catch {
    weatherTableAvailable = false;
    // Fallback for databases where the MVP migration has not yet been applied.
    const baseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate));

    allMatches = baseMatches.map((match) => ({
      ...match,
      mvpName: null,
      weatherCondition: null,
      weatherTemperatureC: null,
      weatherPrecipMm: null,
    }));
  }

  if (weatherTableAvailable) {
    allMatches = await Promise.all(
      allMatches.map(async (match) => {
        const hasWeatherData =
          match.weatherCondition !== null ||
          match.weatherTemperatureC !== null ||
          match.weatherPrecipMm !== null;

        if (hasWeatherData) {
          return match;
        }

        try {
          const weatherData = await ensureWeatherStoredForMatch(match.id, match.matchDate);
          return {
            ...match,
            weatherCondition: weatherData.conditionLabel,
            weatherTemperatureC: weatherData.temperatureC,
            weatherPrecipMm: weatherData.precipMm,
          };
        } catch {
          return match;
        }
      })
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Spiele</h1>
          <Link
            href="/admin/matches/new"
            className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Neues Spiel
          </Link>
        </div>

        {allMatches.length === 0 ? (
          <p className="text-zinc-400">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-950/70 text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left">Datum</th>
                  <th className="px-4 py-3 text-left">Saison</th>
                  <th className="px-4 py-3 text-left">Spiel</th>
                  <th className="px-4 py-3 text-left">Wetter</th>
                  <th className="px-4 py-3 text-left">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {allMatches.map((match) => (
                  <tr key={match.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{match.matchDate.toLocaleDateString("de-DE")}</td>
                    <td className="px-4 py-3 text-zinc-300">{match.seasonName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p>
                        {match.team1Name} vs {match.team2Name}
                      </p>
                      <p className="text-xs text-zinc-400">MVP: {match.mvpName ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {match.weatherCondition || match.weatherTemperatureC !== null || match.weatherPrecipMm !== null ? (
                        <>
                          <p>{match.weatherCondition ?? "Wetter erfasst"}</p>
                          <p className="text-xs text-zinc-400">
                            {match.weatherTemperatureC !== null ? `${match.weatherTemperatureC.toFixed(1)}°C` : "—"}
                            {" · "}
                            {match.weatherPrecipMm !== null ? `${match.weatherPrecipMm.toFixed(1)} mm` : "kein Niederschlag"}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/matches/${match.id}/participants`}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:border-zinc-500"
                        >
                          Teilnehmer
                        </Link>
                        <Link
                          href={`/admin/matches/${match.id}/goals`}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:border-zinc-500"
                        >
                          Tore
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}