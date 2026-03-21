import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, matchWeather, players, seasons } from "@/src/db/schema";
import { buildMatchStory } from "@/src/lib/matchStory";

export default async function MatchesPage() {
  let allMatches: Array<{
    id: number;
    matchDate: Date;
    seasonName: string | null;
    team1Name: string;
    team2Name: string;
    team1Score: number;
    team2Score: number;
    mvpPlayerId: number | null;
    mvpName: string | null;
  }> = [];

  const scorerPlayers = alias(players, "scorer_players");

  try {
    allMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: matches.mvpPlayerId,
        mvpName: players.name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(players, eq(matches.mvpPlayerId, players.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));
  } catch {
    // Fallback for databases where the MVP migration has not yet been applied.
    const baseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));

    allMatches = baseMatches.map((match) => ({
      ...match,
      mvpPlayerId: null,
      mvpName: null,
    }));
  }

  const matchIds = allMatches.map((match) => match.id);

  const [allGoals, allWeather] = await Promise.all([
    matchIds.length > 0
      ? db
          .select({
            matchId: goalEvents.matchId,
            teamSide: goalEvents.teamSide,
            isOwnGoal: goalEvents.isOwnGoal,
            scorerPlayerId: goalEvents.scorerPlayerId,
            scorerName: scorerPlayers.name,
            assistPlayerId: goalEvents.assistPlayerId,
          })
          .from(goalEvents)
          .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
          .where(inArray(goalEvents.matchId, matchIds))
      : Promise.resolve([]),
    matchIds.length > 0
      ? db
          .select({
            matchId: matchWeather.matchId,
            conditionLabel: matchWeather.conditionLabel,
            temperatureC: matchWeather.temperatureC,
            precipMm: matchWeather.precipMm,
          })
          .from(matchWeather)
          .where(inArray(matchWeather.matchId, matchIds))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const goalsByMatchId = new Map<number, typeof allGoals>();
  for (const goal of allGoals) {
    const existing = goalsByMatchId.get(goal.matchId);
    if (existing) {
      existing.push(goal);
    } else {
      goalsByMatchId.set(goal.matchId, [goal]);
    }
  }

  const weatherByMatchId = new Map<number, (typeof allWeather)[number]>();
  for (const weather of allWeather) {
    weatherByMatchId.set(weather.matchId, weather);
  }

  const storiesByMatchId = new Map<number, string[]>();
  allMatches.forEach((match, index) => {
    const story = buildMatchStory({
      match: {
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        team1Goals: match.team1Score,
        team2Goals: match.team2Score,
        mvpPlayerId: match.mvpPlayerId,
        mvpName: match.mvpName,
      },
      goals: goalsByMatchId.get(match.id) ?? [],
      weather: weatherByMatchId.get(match.id)
        ? {
            conditionLabel: weatherByMatchId.get(match.id)!.conditionLabel,
            temperatureC: weatherByMatchId.get(match.id)!.temperatureC,
            precipMm: weatherByMatchId.get(match.id)!.precipMm,
          }
        : null,
      previousMatches: allMatches.slice(index + 1).map((previousMatch) => ({
        team1Name: previousMatch.team1Name,
        team2Name: previousMatch.team2Name,
        team1Goals: previousMatch.team1Score,
        team2Goals: previousMatch.team2Score,
      })),
    });

    storiesByMatchId.set(match.id, story.slice(0, 2));
  });

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
                      <p className="text-xs text-zinc-400">
                        Ergebnis: {match.team1Score}:{match.team2Score}
                      </p>
                      <p className="text-xs text-zinc-400">MVP: {match.mvpName ?? "—"}</p>
                      {(storiesByMatchId.get(match.id) ?? []).map((line, index) => (
                        <p key={`${match.id}-story-${index}`} className="text-xs text-zinc-500">
                          {line}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {weatherByMatchId.get(match.id) ? (
                        <>
                          <p>{weatherByMatchId.get(match.id)?.conditionLabel ?? "Wetter erfasst"}</p>
                          <p className="text-xs text-zinc-400">
                            {weatherByMatchId.get(match.id)?.temperatureC !== null &&
                            weatherByMatchId.get(match.id)?.temperatureC !== undefined
                              ? `${weatherByMatchId.get(match.id)?.temperatureC.toFixed(1)}°C`
                              : "—"}
                            {" · "}
                            {weatherByMatchId.get(match.id)?.precipMm !== null &&
                            weatherByMatchId.get(match.id)?.precipMm !== undefined
                              ? `${weatherByMatchId.get(match.id)?.precipMm.toFixed(1)} mm`
                              : "kein Niederschlag"}
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