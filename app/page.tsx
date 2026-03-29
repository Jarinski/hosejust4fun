import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  matchParticipants,
  matchdayParticipants,
  matchdays,
  matches,
  matchWeather,
  players,
  seasons,
} from "@/src/db/schema";
import { buildMatchStory } from "@/src/lib/matchStory";
import { buildMatchdayForecast } from "@/src/lib/matchdayForecast";
import { fetchWeatherForMatchDate, getUpcomingMondayIsoInBerlin } from "@/src/lib/weather";
import { getWeatherPresentation } from "@/src/lib/weatherIcons";

type MatchBrief = {
  id: number;
  matchDate: Date;
  seasonName: string | null;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  mvpPlayerId: number | null;
  mvpName: string | null;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
}

function formatIsoDate(isoDate: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${isoDate}T00:00:00`));
}

export default async function Home() {
  const mvpPlayers = alias(players, "mvp_players");
  const scorerPlayers = alias(players, "scorer_players");
  const assistPlayers = alias(players, "assist_players");
  
  type LatestMatchGoal = {
    teamSide: "team_1" | "team_2";
    isOwnGoal: boolean;
    scorerPlayerId: number;
    scorerName: string;
    assistPlayerId: number | null;
    assistName: string | null;
  };

  let mvpColumnAvailable = true;
  let recentMatches: MatchBrief[] = [];
  let allMatchesForSeries: MatchBrief[] = [];

  try {
    recentMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: matches.mvpPlayerId,
        mvpName: mvpPlayers.name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(mvpPlayers, eq(matches.mvpPlayerId, mvpPlayers.id))
      .orderBy(desc(matches.matchDate), desc(matches.id))
      .limit(5);

    allMatchesForSeries = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: matches.mvpPlayerId,
        mvpName: mvpPlayers.name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(mvpPlayers, eq(matches.mvpPlayerId, mvpPlayers.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));
  } catch {
    mvpColumnAvailable = false;

    const recentBaseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: sql<number | null>`null`,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate), desc(matches.id))
      .limit(5);

    const allBaseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: sql<number | null>`null`,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));

    recentMatches = recentBaseMatches.map((match) => ({ ...match, mvpName: null }));
    allMatchesForSeries = allBaseMatches.map((match) => ({ ...match, mvpName: null }));
  }

  let latestMatch = recentMatches[0] ?? null;
  let ownGoalColumnAvailable = true;

  let latestMatchGoals: LatestMatchGoal[] = [];
  if (latestMatch) {
    try {
      latestMatchGoals = await db
        .select({
          teamSide: goalEvents.teamSide,
          isOwnGoal: goalEvents.isOwnGoal,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: scorerPlayers.name,
          assistPlayerId: goalEvents.assistPlayerId,
          assistName: assistPlayers.name,
        })
        .from(goalEvents)
        .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
        .leftJoin(assistPlayers, eq(goalEvents.assistPlayerId, assistPlayers.id))
        .where(eq(goalEvents.matchId, latestMatch.id));
    } catch {
      ownGoalColumnAvailable = false;

      const legacyGoals = await db
        .select({
          teamSide: goalEvents.teamSide,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: scorerPlayers.name,
          assistPlayerId: goalEvents.assistPlayerId,
          assistName: assistPlayers.name,
        })
        .from(goalEvents)
        .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
        .leftJoin(assistPlayers, eq(goalEvents.assistPlayerId, assistPlayers.id))
        .where(eq(goalEvents.matchId, latestMatch.id));

      latestMatchGoals = legacyGoals.map((goal) => ({
        ...goal,
        isOwnGoal: false,
      }));
    }
  }

  const latestMatchWeather = latestMatch
    ? await db
        .select({
          conditionLabel: matchWeather.conditionLabel,
          temperatureC: matchWeather.temperatureC,
          precipMm: matchWeather.precipMm,
        })
        .from(matchWeather)
        .where(eq(matchWeather.matchId, latestMatch.id))
        .then((rows) => rows[0] ?? null)
        .catch(() => null)
    : null;

  const matchIdsForScoreSync = Array.from(new Set(allMatchesForSeries.map((match) => match.id)));

  if (matchIdsForScoreSync.length > 0) {
    const goalScoreRows = await db
      .select({
        matchId: goalEvents.matchId,
        team1Score: sql<number>`coalesce(sum(case when ${goalEvents.teamSide} = 'team_1' then 1 else 0 end), 0)::int`,
        team2Score: sql<number>`coalesce(sum(case when ${goalEvents.teamSide} = 'team_2' then 1 else 0 end), 0)::int`,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIdsForScoreSync))
      .groupBy(goalEvents.matchId)
      .catch(() => []);

    const scoreByMatchId = new Map(
      goalScoreRows.map((row) => [row.matchId, { team1Score: row.team1Score, team2Score: row.team2Score }])
    );

    const applySyncedScore = (match: MatchBrief): MatchBrief => {
      const syncedScore = scoreByMatchId.get(match.id);
      if (!syncedScore) {
        return match;
      }

      return {
        ...match,
        team1Score: syncedScore.team1Score,
        team2Score: syncedScore.team2Score,
      };
    };

    allMatchesForSeries = allMatchesForSeries.map(applySyncedScore);
    recentMatches = recentMatches.map(applySyncedScore);
    latestMatch = recentMatches[0] ?? null;
  }

  const previousMatchesForLatest = allMatchesForSeries.slice(1);
  const previousMatchIdsForLatest = previousMatchesForLatest.map((match) => match.id);
  const previousGoalsForLatest =
    previousMatchIdsForLatest.length > 0
      ? await db
          .select({
            matchId: goalEvents.matchId,
            isOwnGoal: goalEvents.isOwnGoal,
            scorerPlayerId: goalEvents.scorerPlayerId,
            assistPlayerId: goalEvents.assistPlayerId,
          })
          .from(goalEvents)
          .where(inArray(goalEvents.matchId, previousMatchIdsForLatest))
          .catch(async () => {
            const legacyGoals = await db
              .select({
                matchId: goalEvents.matchId,
                scorerPlayerId: goalEvents.scorerPlayerId,
                assistPlayerId: goalEvents.assistPlayerId,
              })
              .from(goalEvents)
              .where(inArray(goalEvents.matchId, previousMatchIdsForLatest));

            return legacyGoals.map((goal) => ({
              ...goal,
              isOwnGoal: false,
            }));
          })
      : [];

  const previousScorerIdsByMatchId = new Map<number, number[]>();
  const previousAssistIdsByMatchId = new Map<number, number[]>();

  for (const goal of previousGoalsForLatest) {
    if (goal.isOwnGoal) continue;

    const scorerIds = previousScorerIdsByMatchId.get(goal.matchId) ?? [];
    if (!scorerIds.includes(goal.scorerPlayerId)) {
      scorerIds.push(goal.scorerPlayerId);
      previousScorerIdsByMatchId.set(goal.matchId, scorerIds);
    }

    if (goal.assistPlayerId !== null) {
      const assistIds = previousAssistIdsByMatchId.get(goal.matchId) ?? [];
      if (!assistIds.includes(goal.assistPlayerId)) {
        assistIds.push(goal.assistPlayerId);
        previousAssistIdsByMatchId.set(goal.matchId, assistIds);
      }
    }
  }

  const latestWeatherPresentation = latestMatchWeather
    ? getWeatherPresentation({
        conditionLabel: latestMatchWeather.conditionLabel,
        temperatureC: latestMatchWeather.temperatureC,
        precipMm: latestMatchWeather.precipMm,
      })
    : null;

  const upcomingMondayIso = getUpcomingMondayIsoInBerlin();

  const nextMatchWeather = await fetchWeatherForMatchDate(upcomingMondayIso).catch(() => ({
    conditionLabel: "Wetterdaten nicht verfügbar",
    temperatureC: null,
    feelsLikeC: null,
    precipMm: null,
    windKmh: null,
    humidityPct: null,
  }));

  const nextMatchWeatherPresentation = getWeatherPresentation({
    conditionLabel: nextMatchWeather.conditionLabel,
    temperatureC: nextMatchWeather.temperatureC,
    precipMm: nextMatchWeather.precipMm,
    windKmh: nextMatchWeather.windKmh,
  });

  const upcomingMatchdayRows = await db
    .select({ id: matchdays.id })
    .from(matchdays)
    .where(eq(matchdays.matchDate, upcomingMondayIso))
    .limit(1)
    .catch(() => []);

  const upcomingMatchdayId = upcomingMatchdayRows[0]?.id ?? null;

  let upcomingPlayerStatusRows: Array<{ id: number; name: string; isCanceled: boolean }> = [];
  if (upcomingMatchdayId !== null) {
    try {
      upcomingPlayerStatusRows = await db
        .select({
          id: players.id,
          name: players.name,
          isCanceled: matchdayParticipants.isCanceled,
        })
        .from(matchdayParticipants)
        .innerJoin(players, eq(matchdayParticipants.playerId, players.id))
        .where(eq(matchdayParticipants.matchdayId, upcomingMatchdayId))
        .orderBy(asc(players.name));
    } catch {
      const legacyRows = await db
        .select({ id: players.id, name: players.name })
        .from(matchdayParticipants)
        .innerJoin(players, eq(matchdayParticipants.playerId, players.id))
        .where(eq(matchdayParticipants.matchdayId, upcomingMatchdayId))
        .orderBy(asc(players.name))
        .catch(() => []);

      upcomingPlayerStatusRows = legacyRows.map((row) => ({
        id: row.id,
        name: String(row.name),
        isCanceled: false,
      }));
    }
  }

  const upcomingSelectedPlayers = upcomingPlayerStatusRows
    .filter((player) => !player.isCanceled)
    .map((player) => ({ id: player.id, name: String(player.name) }));

  const upcomingCanceledPlayers = upcomingPlayerStatusRows
    .filter((player) => player.isCanceled)
    .map((player) => ({ id: player.id, name: String(player.name) }));

  const selectedPlayerIdsSet = new Set(upcomingSelectedPlayers.map((player) => player.id));

  const historicalMatchesForForecast = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
    })
    .from(matches)
    .where(lt(matches.matchDate, new Date(`${upcomingMondayIso}T23:59:59`)))
    .orderBy(desc(matches.matchDate), desc(matches.id));

  const historicalMatchIdsForForecast = historicalMatchesForForecast.map((match) => match.id);

  const historicalParticipantsForForecast =
    historicalMatchIdsForForecast.length > 0
      ? await db
          .select({
            matchId: matchParticipants.matchId,
            playerId: matchParticipants.playerId,
            teamSide: matchParticipants.teamSide,
          })
          .from(matchParticipants)
          .where(inArray(matchParticipants.matchId, historicalMatchIdsForForecast))
      : [];

  const participantIdsByMatch = new Map<number, Set<number>>();
  for (const row of historicalParticipantsForForecast) {
    const existing = participantIdsByMatch.get(row.matchId) ?? new Set<number>();
    existing.add(row.playerId);
    participantIdsByMatch.set(row.matchId, existing);
  }

  const returningPlayers = upcomingSelectedPlayers
    .map((player) => {
      let missedMatches = 0;

      for (const match of historicalMatchesForForecast) {
        const participantIds = participantIdsByMatch.get(match.id) ?? new Set<number>();
        if (participantIds.has(player.id)) {
          break;
        }
        missedMatches += 1;
      }

      return {
        name: player.name,
        missedMatches,
      };
    })
    .filter((entry) => entry.missedMatches >= 2)
    .sort((a, b) => b.missedMatches - a.missedMatches);

  const playerNameById = new Map(
    [...upcomingSelectedPlayers, ...upcomingCanceledPlayers].map((player) => [player.id, player.name])
  );

  const duoStatsByKey = new Map<string, { gamesTogether: number; winsTogether: number }>();

  for (const match of historicalMatchesForForecast) {
    const team1 = historicalParticipantsForForecast
      .filter((participant) => participant.matchId === match.id && participant.teamSide === "team_1")
      .map((participant) => participant.playerId)
      .sort((a, b) => a - b);

    const team2 = historicalParticipantsForForecast
      .filter((participant) => participant.matchId === match.id && participant.teamSide === "team_2")
      .map((participant) => participant.playerId)
      .sort((a, b) => a - b);

    const team1Won = match.team1Score > match.team2Score;
    const team2Won = match.team2Score > match.team1Score;

    const processTeam = (playerIds: number[], won: boolean) => {
      for (let i = 0; i < playerIds.length; i += 1) {
        for (let j = i + 1; j < playerIds.length; j += 1) {
          const a = playerIds[i]!;
          const b = playerIds[j]!;
          const key = `${a}-${b}`;
          const previous = duoStatsByKey.get(key) ?? { gamesTogether: 0, winsTogether: 0 };
          duoStatsByKey.set(key, {
            gamesTogether: previous.gamesTogether + 1,
            winsTogether: previous.winsTogether + (won ? 1 : 0),
          });
        }
      }
    };

    processTeam(team1, team1Won);
    processTeam(team2, team2Won);
  }

  const strongestDuo = Array.from(duoStatsByKey.entries())
    .map(([key, stats]) => {
      const [aRaw, bRaw] = key.split("-");
      const a = Number(aRaw);
      const b = Number(bRaw);
      return { a, b, ...stats };
    })
    .filter(
      (duo) =>
        selectedPlayerIdsSet.has(duo.a) && selectedPlayerIdsSet.has(duo.b) && duo.gamesTogether >= 2
    )
    .map((duo) => ({
      playerAName: playerNameById.get(duo.a) ?? `Spieler #${duo.a}`,
      playerBName: playerNameById.get(duo.b) ?? `Spieler #${duo.b}`,
      gamesTogether: duo.gamesTogether,
      winsTogether: duo.winsTogether,
      winRatePct: Math.round((duo.winsTogether / duo.gamesTogether) * 100),
    }))
    .sort((a, b) => {
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      if (b.gamesTogether !== a.gamesTogether) return b.gamesTogether - a.gamesTogether;
      return a.playerAName.localeCompare(b.playerAName, "de");
    })[0] ?? null;

  const bestOverallDuo = Array.from(duoStatsByKey.entries())
    .map(([key, stats]) => {
      const [aRaw, bRaw] = key.split("-");
      const a = Number(aRaw);
      const b = Number(bRaw);
      return { a, b, ...stats };
    })
    .filter((duo) => duo.gamesTogether >= 3)
    .map((duo) => ({
      playerAName: String(playerNameById.get(duo.a) ?? `Spieler #${duo.a}`),
      playerBName: String(playerNameById.get(duo.b) ?? `Spieler #${duo.b}`),
      gamesTogether: duo.gamesTogether,
      winsTogether: duo.winsTogether,
      winRatePct: Math.round((duo.winsTogether / duo.gamesTogether) * 100),
    }))
    .sort((a, b) => {
      if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
      if (b.gamesTogether !== a.gamesTogether) return b.gamesTogether - a.gamesTogether;
      return a.playerAName.localeCompare(b.playerAName, "de");
    })[0] ?? null;

  const bestAvailableDuo = strongestDuo;

  const participantByMatchAndPlayer = new Map<string, "team_1" | "team_2">();
  for (const participant of historicalParticipantsForForecast) {
    participantByMatchAndPlayer.set(
      `${participant.matchId}-${participant.playerId}`,
      participant.teamSide
    );
  }

  const canceledStreakPlayer = upcomingCanceledPlayers
    .map((player) => {
      let streak = 0;

      for (const match of historicalMatchesForForecast) {
        const teamSide = participantByMatchAndPlayer.get(`${match.id}-${player.id}`);
        if (!teamSide) {
          continue;
        }

        const didWin =
          teamSide === "team_1"
            ? match.team1Score > match.team2Score
            : match.team2Score > match.team1Score;

        if (!didWin) {
          break;
        }

        streak += 1;
      }

      return {
        name: player.name,
        streak,
      };
    })
    .filter((entry) => entry.streak >= 3)
    .sort((a, b) => b.streak - a.streak)[0] ?? null;

  const nextMatchForecastLines = buildMatchdayForecast({
    selectedPlayers: upcomingSelectedPlayers,
    canceledPlayers: upcomingCanceledPlayers,
    weather: nextMatchWeather,
    strongestDuo,
    bestOverallDuo,
    bestAvailableDuo,
    returningPlayers,
    weatherPerformance: null,
    canceledStreakPlayer,
  });

  const goalsCount = sql<number>`count(${goalEvents.id})`;
  const assistsCount = sql<number>`count(${goalEvents.id})`;
  const mvpCount = sql<number>`count(${matches.id})`;
  const gamesCount = sql<number>`count(${matchParticipants.id})`;

  const [topScorers, topAssists, mostGames] = await Promise.all([
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: goalsCount.as("value"),
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
      .groupBy(players.id, players.name)
      .orderBy(desc(goalsCount), asc(players.name))
      .limit(5),
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: assistsCount.as("value"),
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
      .where(isNotNull(goalEvents.assistPlayerId))
      .groupBy(players.id, players.name)
      .orderBy(desc(assistsCount), asc(players.name))
      .limit(5),
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: gamesCount.as("value"),
      })
      .from(matchParticipants)
      .innerJoin(players, eq(matchParticipants.playerId, players.id))
      .groupBy(players.id, players.name)
      .orderBy(desc(gamesCount), asc(players.name))
      .limit(5),
  ]);

  const topMvps = mvpColumnAvailable
    ? await db
        .select({
          playerId: players.id,
          playerName: players.name,
          value: mvpCount.as("value"),
        })
        .from(matches)
        .innerJoin(players, eq(matches.mvpPlayerId, players.id))
        .where(isNotNull(matches.mvpPlayerId))
        .groupBy(players.id, players.name)
        .orderBy(desc(mvpCount), asc(players.name))
        .limit(5)
    : [];

  const newsflash = latestMatch
    ? buildMatchStory({
        match: {
          team1Name: latestMatch.team1Name,
          team2Name: latestMatch.team2Name,
          team1Goals: latestMatch.team1Score,
          team2Goals: latestMatch.team2Score,
          mvpPlayerId: latestMatch.mvpPlayerId,
          mvpName: latestMatch.mvpName,
        },
        goals: latestMatchGoals,
        weather: latestMatchWeather,
        previousMatches: previousMatchesForLatest.map((match) => ({
          team1Name: match.team1Name,
          team2Name: match.team2Name,
          team1Goals: match.team1Score,
          team2Goals: match.team2Score,
          scorerPlayerIds: previousScorerIdsByMatchId.get(match.id) ?? [],
          assistPlayerIds: previousAssistIdsByMatchId.get(match.id) ?? [],
        })),
      }).slice(0, ownGoalColumnAvailable ? 3 : 2)
    : [];

  const statCards = [
    {
      title: "Topscorer",
      leader: topScorers[0]?.playerName ?? "—",
      value: topScorers[0]?.value ?? 0,
      info:
        topScorers.length > 1
          ? `${topScorers[0].value - topScorers[1].value} Tore Vorsprung`
          : "Allein an der Spitze",
    },
    {
      title: "Top-Vorlagengeber",
      leader: topAssists[0]?.playerName ?? "—",
      value: topAssists[0]?.value ?? 0,
      info:
        topAssists.length > 1
          ? `${topAssists[0].value - topAssists[1].value} Assists Vorsprung`
          : "Playmaker Nummer 1",
    },
    {
      title: "MVP-Leader",
      leader: topMvps[0]?.playerName ?? "—",
      value: topMvps[0]?.value ?? 0,
      info:
        topMvps.length > 1
          ? `${topMvps[0].value - topMvps[1].value} MVPs Vorsprung`
          : "Konstant bester Mann",
    },
    {
      title: "Meiste Spiele",
      leader: mostGames[0]?.playerName ?? "—",
      value: mostGames[0]?.value ?? 0,
      info: mostGames.length > 1 ? `${mostGames[1].playerName} folgt dahinter` : "Dauerbrenner",
    },
  ];

  return (
    <main className="min-h-screen bg-stone-100 text-zinc-900">
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-8">
        <section className="mb-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Matchday Dashboard</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">HoSe Just4Fun</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">
            Das kompakte Fußball-Magazin für eure Runde: Ergebnisse, Trends, Storylines und die
            stärksten Performer auf einen Blick.
          </p>

          {latestMatch ? (
            <article className="mt-4 rounded-xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">Letztes Spiel</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <p className="text-lg font-semibold text-zinc-900 sm:text-xl">{latestMatch.team1Name}</p>
                <p className="text-center text-3xl font-extrabold text-zinc-900 sm:text-4xl">
                  {latestMatch.team1Score}:{latestMatch.team2Score}
                </p>
                <p className="text-left text-lg font-semibold text-zinc-900 sm:text-right sm:text-xl">{latestMatch.team2Name}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 sm:text-sm">
                <span>{formatDate(latestMatch.matchDate)}</span>
                <span>Saison: {latestMatch.seasonName ?? "—"}</span>
                <span>MVP: {latestMatch.mvpName ?? "nicht vergeben"}</span>
                {latestWeatherPresentation ? (
                  <span>
                    Wetter: {latestWeatherPresentation.icon} {latestWeatherPresentation.label}
                  </span>
                ) : null}
              </div>
            </article>
          ) : (
            <article className="mt-4 rounded-xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
              <p className="text-zinc-600">Noch keine Spiele erfasst.</p>
            </article>
          )}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Newsflash</h2>
            <span className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] uppercase tracking-wider text-zinc-600">
              Redaktion
            </span>
          </div>
          {newsflash.length > 0 ? (
            <ul className="space-y-2 text-sm text-zinc-700">
              {newsflash.map((item, index) => (
                <li key={`${item}-${index}`} className="rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2.5">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-500">Sobald Spiele vorhanden sind, erscheinen hier die Storylines.</p>
          )}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold sm:text-xl">Ausblick aufs nächste Montagsspiel</h2>
            <span className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] uppercase tracking-wider text-zinc-600">
              Prognose
            </span>
          </div>

          <div className="mt-3 rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <p className="text-sm text-zinc-600">{formatIsoDate(upcomingMondayIso)} · Holm-Seppensen</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 sm:text-xl">
              {nextMatchWeatherPresentation.icon} {nextMatchWeatherPresentation.label}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Temperatur: {nextMatchWeather.temperatureC !== null ? `${nextMatchWeather.temperatureC.toFixed(1)} °C` : "—"}
              {" · "}
              Gefühlte Temp.: {nextMatchWeather.feelsLikeC !== null ? `${nextMatchWeather.feelsLikeC.toFixed(1)} °C` : "—"}
              {" · "}
              Niederschlag: {nextMatchWeather.precipMm !== null ? `${nextMatchWeather.precipMm.toFixed(1)} mm` : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Hinweis: Prognosen können sich bis zum Spieltag noch ändern.
            </p>

            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {nextMatchForecastLines.map((line, index) => (
                <li key={`${line}-${index}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-500"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{card.title}</p>
              <p className="mt-1.5 text-base font-semibold text-zinc-900">{card.leader}</p>
              <p className="mt-1.5 text-3xl font-extrabold text-zinc-900">{card.value}</p>
              <p className="mt-1.5 text-xs text-zinc-500 sm:text-sm">{card.info}</p>
            </article>
          ))}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-lg font-bold sm:text-xl">Letzte Spiele</h2>
          {recentMatches.length === 0 ? (
            <p className="text-zinc-500">Noch keine Spiele eingetragen.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {recentMatches.map((match) => {
                const margin = Math.abs(match.team1Score - match.team2Score);
                const detail = margin >= 3 ? "Klarer Sieg" : margin === 1 ? "Knappe Kiste" : "Ausgeglichen";

                return (
                  <Link
                    key={match.id}
                    href={`/admin/matches/${match.id}`}
                    className="rounded-lg border border-zinc-300 bg-stone-50 p-3 transition hover:border-zinc-500"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-900">{match.team1Name}</p>
                      <p className="text-xl font-bold text-zinc-900">
                        {match.team1Score}:{match.team2Score}
                      </p>
                      <p className="text-right font-semibold text-zinc-900">{match.team2Name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 sm:text-sm">
                      <span>{formatDate(match.matchDate)}</span>
                      <span>{match.seasonName ?? "—"}</span>
                      <span>MVP: {match.mvpName ?? "—"}</span>
                      <span>{detail}</span>
                      <span className="font-medium text-zinc-900">Insights ansehen →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-3 text-lg font-bold sm:text-xl">Rankings</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "Topscorer Top 5", data: topScorers, unit: "Tore" },
              { title: "Top-Assists Top 5", data: topAssists, unit: "Assists" },
              { title: "Top-MVPs Top 5", data: topMvps, unit: "MVP" },
            ].map((ranking) => (
              <article key={ranking.title} className="rounded-lg border border-zinc-300 bg-stone-50 p-3.5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 sm:text-sm">
                  {ranking.title}
                </h3>
                {ranking.data.length === 0 ? (
                  <p className="text-sm text-zinc-500">Noch keine Daten.</p>
                ) : (
                  <ol className="space-y-1.5 text-sm">
                    {ranking.data.map((entry, index) => (
                      <li key={entry.playerId} className="flex items-center justify-between gap-3">
                        <span className="text-zinc-900">
                          <span className="mr-2 text-zinc-500">#{index + 1}</span>
                          {entry.playerName}
                        </span>
                        <span className="font-semibold text-zinc-900">
                          {entry.value} {ranking.unit}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5 text-sm">
            <Link
              href="/admin/matches"
              className="rounded-lg border border-zinc-900 bg-zinc-900 px-3.5 py-2 text-zinc-100 transition hover:bg-zinc-700"
            >
              Matches verwalten
            </Link>
            <Link
              href="/stats"
              className="rounded-lg border border-zinc-300 bg-stone-50 px-3.5 py-2 text-zinc-900 transition hover:border-zinc-500"
            >
              Mehr Statistiken
            </Link>
            <Link
              href="/stats/players"
              className="rounded-lg border border-zinc-300 bg-stone-50 px-3.5 py-2 text-zinc-900 transition hover:border-zinc-500"
            >
              Spielerübersicht
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
