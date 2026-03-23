import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, matchWeather, players, seasons } from "@/src/db/schema";
import { getAdminSession } from "@/src/lib/auth";
import { buildMatchStory } from "@/src/lib/matchStory";
import { getWeatherPresentation } from "@/src/lib/weatherIcons";

export default async function MatchesPage() {
  const isAdmin = Boolean(await getAdminSession());

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

  const allGoals =
    matchIds.length > 0
      ? await db
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
          .catch(async () => {
            // Fallback for databases where the own-goal migration has not yet been applied.
            const legacyGoals = await db
              .select({
                matchId: goalEvents.matchId,
                teamSide: goalEvents.teamSide,
                scorerPlayerId: goalEvents.scorerPlayerId,
                scorerName: scorerPlayers.name,
                assistPlayerId: goalEvents.assistPlayerId,
              })
              .from(goalEvents)
              .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
              .where(inArray(goalEvents.matchId, matchIds));

            return legacyGoals.map((goal) => ({
              ...goal,
              isOwnGoal: false,
            }));
          })
      : [];

  const allWeather =
    matchIds.length > 0
      ? await db
          .select({
            matchId: matchWeather.matchId,
            conditionLabel: matchWeather.conditionLabel,
            temperatureC: matchWeather.temperatureC,
            precipMm: matchWeather.precipMm,
          })
          .from(matchWeather)
          .where(inArray(matchWeather.matchId, matchIds))
          .catch(() => [])
      : [];

  const goalsByMatchId = new Map<number, typeof allGoals>();
  for (const goal of allGoals) {
    const existing = goalsByMatchId.get(goal.matchId);
    if (existing) {
      existing.push(goal);
    } else {
      goalsByMatchId.set(goal.matchId, [goal]);
    }
  }

  const scoreByMatchId = new Map<number, { team1Score: number; team2Score: number }>();
  for (const [matchId, goals] of goalsByMatchId.entries()) {
    const team1Score = goals.filter((goal) => goal.teamSide === "team_1").length;
    const team2Score = goals.filter((goal) => goal.teamSide === "team_2").length;
    scoreByMatchId.set(matchId, { team1Score, team2Score });
  }

  const weatherByMatchId = new Map<number, (typeof allWeather)[number]>();
  for (const weather of allWeather) {
    weatherByMatchId.set(weather.matchId, weather);
  }

  const storiesByMatchId = new Map<number, string[]>();
  const scorerIdsByMatchId = new Map<number, number[]>();
  const assistIdsByMatchId = new Map<number, number[]>();

  for (const goal of allGoals) {
    if (goal.isOwnGoal) continue;

    const scorerIds = scorerIdsByMatchId.get(goal.matchId) ?? [];
    if (!scorerIds.includes(goal.scorerPlayerId)) {
      scorerIds.push(goal.scorerPlayerId);
      scorerIdsByMatchId.set(goal.matchId, scorerIds);
    }

    if (goal.assistPlayerId !== null) {
      const assistIds = assistIdsByMatchId.get(goal.matchId) ?? [];
      if (!assistIds.includes(goal.assistPlayerId)) {
        assistIds.push(goal.assistPlayerId);
        assistIdsByMatchId.set(goal.matchId, assistIds);
      }
    }
  }

  allMatches.forEach((match, index) => {
    const currentScore = scoreByMatchId.get(match.id);
    const currentTeam1Score = currentScore ? currentScore.team1Score : match.team1Score;
    const currentTeam2Score = currentScore ? currentScore.team2Score : match.team2Score;

    const story = buildMatchStory({
      match: {
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        team1Goals: currentTeam1Score,
        team2Goals: currentTeam2Score,
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
        ...(() => {
          const previousScore = scoreByMatchId.get(previousMatch.id);
          return {
            team1Goals: previousScore ? previousScore.team1Score : previousMatch.team1Score,
            team2Goals: previousScore ? previousScore.team2Score : previousMatch.team2Score,
          };
        })(),
        team1Name: previousMatch.team1Name,
        team2Name: previousMatch.team2Name,
        scorerPlayerIds: scorerIdsByMatchId.get(previousMatch.id) ?? [],
        assistPlayerIds: assistIdsByMatchId.get(previousMatch.id) ?? [],
      })),
    });

    storiesByMatchId.set(match.id, story.slice(0, 2));
  });

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Spiele</h1>
          {isAdmin ? (
            <Link
              href="/admin/matches/new"
              className="rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 text-sm hover:border-zinc-500"
            >
              Neues Spiel
            </Link>
          ) : null}
        </div>

        {allMatches.length === 0 ? (
          <p className="text-zinc-500">Noch keine Spiele vorhanden.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-300">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-zinc-600">
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
                  <tr key={match.id} className="border-t border-zinc-300">
                    {(() => {
                      const weather = weatherByMatchId.get(match.id);
                      const syncedScore = scoreByMatchId.get(match.id);
                      const displayTeam1Score = syncedScore ? syncedScore.team1Score : match.team1Score;
                      const displayTeam2Score = syncedScore ? syncedScore.team2Score : match.team2Score;

                      return (
                        <>
                    <td className="px-4 py-3">{match.matchDate.toLocaleDateString("de-DE")}</td>
                    <td className="px-4 py-3 text-zinc-600">{match.seasonName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p>
                        {match.team1Name} vs {match.team2Name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        Ergebnis: {displayTeam1Score}:{displayTeam2Score}
                      </p>
                      <p className="text-xs text-zinc-500">MVP: {match.mvpName ?? "—"}</p>
                      {(storiesByMatchId.get(match.id) ?? []).map((line, index) => (
                        <p key={`${match.id}-story-${index}`} className="text-xs text-zinc-500">
                          {line}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {weather ? (
                        <>
                          {(() => {
                            const presentation = getWeatherPresentation({
                              conditionLabel: weather.conditionLabel,
                              temperatureC: weather.temperatureC,
                              precipMm: weather.precipMm,
                            });

                            return (
                              <p className="font-medium text-zinc-900">
                                {presentation.icon} {presentation.label}
                              </p>
                            );
                          })()}
                          <p className="text-xs text-zinc-500">
                            {weather.temperatureC !== null && weather.temperatureC !== undefined
                              ? `${weather.temperatureC.toFixed(1)}°C`
                              : "—"}
                            {" · "}
                            {weather.precipMm !== null && weather.precipMm !== undefined
                              ? `${weather.precipMm.toFixed(1)} mm`
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
                          href={`/admin/matches/${match.id}`}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-500"
                        >
                          Details
                        </Link>
                        {isAdmin ? (
                          <>
                            <Link
                              href={`/admin/matches/${match.id}/participants`}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-500"
                            >
                              Teilnehmer
                            </Link>
                            <Link
                              href={`/admin/matches/${match.id}/goals`}
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:border-zinc-500"
                            >
                              Tore
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </td>
                        </>
                      );
                    })()}
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