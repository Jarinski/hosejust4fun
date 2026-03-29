import Link from "next/link";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import {
  goalEvents,
  matchParticipants,
  matches,
  matchWeather,
  playerBadges,
  players,
  seasons,
} from "@/src/db/schema";
import { getAdminSession } from "@/src/lib/auth";
import { getBadgeMeta } from "@/src/lib/badges";
import { buildMatchStory } from "@/src/lib/matchStory";
import { ensureWeatherStoredForMatch } from "@/src/lib/weather";
import { getWeatherPresentation } from "@/src/lib/weatherIcons";
import { deleteMatchById, updateMatchMVP } from "./actions";

type TeamSide = "team_1" | "team_2";

type GoalEventView = {
  id: number;
  teamSide: TeamSide;
  isOwnGoal: boolean;
  scorerPlayerId: number;
  assistPlayerId: number | null;
  minute: number | null;
  goalType: string | null;
  createdAt: Date | null;
};

type TimelineGoalView = GoalEventView & {
  scoreAfterGoal: string;
  statisticNotes: string[];
};

function isEarlyGoalMinute(minute: number | null) {
  return minute !== null && minute >= 0 && minute <= 15;
}

function isLateGoalMinute(minute: number | null) {
  return minute !== null && minute >= 76;
}

function incrementMapCounter(map: Map<number, number>, key: number) {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function incrementComboCounter(map: Map<string, number>, assistPlayerId: number, scorerPlayerId: number) {
  const key = `${assistPlayerId}-${scorerPlayerId}`;
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function getGermanPossessiveName(name: string) {
  const normalized = name.trim();
  if (normalized.length === 0) return "Spielers";
  const lastChar = normalized.slice(-1).toLowerCase();
  if (["s", "ß", "x", "z"].includes(lastChar)) {
    return `${normalized}'`;
  }
  return `${normalized}s`;
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybePgError = error as { code?: string; message?: string };

  // PostgreSQL: undefined_column
  if (maybePgError.code === "42703") {
    return true;
  }

  return typeof maybePgError.message === "string" && maybePgError.message.includes(columnName);
}

function sortGoalsForTimeline(goals: GoalEventView[]) {
  return [...goals].sort((a, b) => {
    if (a.minute !== null && b.minute !== null && a.minute !== b.minute) {
      return a.minute - b.minute;
    }

    if (a.minute !== null && b.minute === null) {
      return -1;
    }

    if (a.minute === null && b.minute !== null) {
      return 1;
    }

    const aCreatedAt = a.createdAt ? a.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bCreatedAt = b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER;

    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    return a.id - b.id;
  });
}

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; deleteError?: string }>;
}) {
  const routeParams = await params;
  const queryParams = await searchParams;
  const isAdmin = Boolean(await getAdminSession());
  const matchId = Number(routeParams.id);

  if (!Number.isInteger(matchId)) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-6">
          Ungültige Match-ID.
        </section>
      </main>
    );
  }

  let mvpColumnAvailable = true;
  let weatherTableAvailable = true;
  let matchRows: Array<{
    id: number;
    matchDate: Date;
    seasonId: number;
    seasonName: string | null;
    team1Name: string;
    team2Name: string;
    mvpPlayerId: number | null;
    weatherCondition: string | null;
    weatherTemperatureC: number | null;
    weatherFeelsLikeC: number | null;
    weatherPrecipMm: number | null;
    weatherWindKmh: number | null;
    weatherHumidityPct: number | null;
  }> = [];

  try {
    matchRows = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonId: matches.seasonId,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        mvpPlayerId: matches.mvpPlayerId,
        weatherCondition: matchWeather.conditionLabel,
        weatherTemperatureC: matchWeather.temperatureC,
        weatherFeelsLikeC: matchWeather.feelsLikeC,
        weatherPrecipMm: matchWeather.precipMm,
        weatherWindKmh: matchWeather.windKmh,
        weatherHumidityPct: matchWeather.humidityPct,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(matchWeather, eq(matchWeather.matchId, matches.id))
      .where(eq(matches.id, matchId))
      .limit(1);
  } catch {
    mvpColumnAvailable = false;
    weatherTableAvailable = false;
    const baseMatchRows = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonId: matches.seasonId,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .where(eq(matches.id, matchId))
      .limit(1);

    matchRows = baseMatchRows.map((match) => ({
      ...match,
      mvpPlayerId: null,
      weatherCondition: null,
      weatherTemperatureC: null,
      weatherFeelsLikeC: null,
      weatherPrecipMm: null,
      weatherWindKmh: null,
      weatherHumidityPct: null,
    }));
  }

  let match = matchRows[0];

  if (!match) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-6">
          Spiel nicht gefunden.
        </section>
      </main>
    );
  }

  if (
    weatherTableAvailable &&
    match.weatherCondition === null &&
    match.weatherTemperatureC === null &&
    match.weatherFeelsLikeC === null &&
    match.weatherPrecipMm === null &&
    match.weatherWindKmh === null &&
    match.weatherHumidityPct === null
  ) {
    try {
      const weatherData = await ensureWeatherStoredForMatch(match.id, match.matchDate);
      match = {
        ...match,
        weatherCondition: weatherData.conditionLabel,
        weatherTemperatureC: weatherData.temperatureC,
        weatherFeelsLikeC: weatherData.feelsLikeC,
        weatherPrecipMm: weatherData.precipMm,
        weatherWindKmh: weatherData.windKmh,
        weatherHumidityPct: weatherData.humidityPct !== null ? Math.round(weatherData.humidityPct) : null,
      };
    } catch {
      // Falls Wetter-Backfill fehlschlägt, bleibt die Seite trotzdem nutzbar.
    }
  }

  const participantRows = await db
    .select({
      id: matchParticipants.id,
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
      playerName: players.name,
    })
    .from(matchParticipants)
    .innerJoin(players, eq(players.id, matchParticipants.playerId))
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(players.name));

  let ownGoalColumnAvailable = true;
  let goalRows: GoalEventView[] = [];

  try {
    goalRows = await db
      .select({
        id: goalEvents.id,
        teamSide: goalEvents.teamSide,
        isOwnGoal: goalEvents.isOwnGoal,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        minute: goalEvents.minute,
        goalType: goalEvents.goalType,
        createdAt: goalEvents.createdAt,
      })
      .from(goalEvents)
      .where(eq(goalEvents.matchId, matchId));
  } catch (error) {
    if (!isMissingColumnError(error, "is_own_goal")) {
      throw error;
    }

    ownGoalColumnAvailable = false;

    const baseGoalRows = await db
      .select({
        id: goalEvents.id,
        teamSide: goalEvents.teamSide,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        minute: goalEvents.minute,
        goalType: goalEvents.goalType,
        createdAt: goalEvents.createdAt,
      })
      .from(goalEvents)
      .where(eq(goalEvents.matchId, matchId));

    goalRows = baseGoalRows.map((goal) => ({
      ...goal,
      isOwnGoal: false,
    }));
  }

  const involvedPlayerIds = Array.from(
    new Set(
      goalRows
        .flatMap((goal) => [goal.scorerPlayerId, goal.assistPlayerId])
        .filter((id): id is number => Number.isInteger(id))
    )
  );

  const goalPlayers =
    involvedPlayerIds.length > 0
      ? await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, involvedPlayerIds))
      : [];

  const playerNameById = new Map<number, string>();

  for (const participant of participantRows) {
    playerNameById.set(participant.playerId, participant.playerName);
  }

  for (const player of goalPlayers) {
    playerNameById.set(player.id, player.name);
  }

  const sortedGoals = sortGoalsForTimeline(goalRows);

  const historicalBoundaryFilter = or(
    lt(matches.matchDate, match.matchDate),
    and(eq(matches.matchDate, match.matchDate), lt(matches.id, match.id))
  );

  let previousSeasonGoals: Array<{
    id: number;
    matchId: number;
    teamSide: TeamSide;
    isOwnGoal: boolean;
    scorerPlayerId: number;
    assistPlayerId: number | null;
    minute: number | null;
    goalType: string | null;
    createdAt: Date | null;
  }> = [];

  try {
    previousSeasonGoals = await db
      .select({
        id: goalEvents.id,
        matchId: goalEvents.matchId,
        teamSide: goalEvents.teamSide,
        isOwnGoal: goalEvents.isOwnGoal,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        minute: goalEvents.minute,
        goalType: goalEvents.goalType,
        createdAt: goalEvents.createdAt,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(eq(matches.seasonId, match.seasonId), historicalBoundaryFilter));
  } catch (error) {
    if (!isMissingColumnError(error, "is_own_goal")) {
      throw error;
    }

    const legacyPreviousSeasonGoals = await db
      .select({
        id: goalEvents.id,
        matchId: goalEvents.matchId,
        teamSide: goalEvents.teamSide,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        minute: goalEvents.minute,
        goalType: goalEvents.goalType,
        createdAt: goalEvents.createdAt,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(eq(matches.seasonId, match.seasonId), historicalBoundaryFilter));

    previousSeasonGoals = legacyPreviousSeasonGoals.map((goal) => ({
      ...goal,
      isOwnGoal: false,
    }));
  }

  // Für die Kombinations-Zähler zählen nur moderne Spieldaten
  // aus matches + goal_events (keine legacy_* Tabellen).
  let previousAssistCombosModern = new Map<string, number>();

  try {
    const previousAssistRows = await db
      .select({
        isOwnGoal: goalEvents.isOwnGoal,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(historicalBoundaryFilter);

    previousAssistCombosModern = previousAssistRows.reduce((acc, goal) => {
      if (goal.isOwnGoal || goal.assistPlayerId === null) {
        return acc;
      }

      incrementComboCounter(acc, goal.assistPlayerId, goal.scorerPlayerId);
      return acc;
    }, new Map<string, number>());
  } catch (error) {
    if (!isMissingColumnError(error, "is_own_goal")) {
      throw error;
    }

    const previousAssistRowsLegacy = await db
      .select({
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(historicalBoundaryFilter);

    previousAssistCombosModern = previousAssistRowsLegacy.reduce((acc, goal) => {
      if (goal.assistPlayerId === null) {
        return acc;
      }

      incrementComboCounter(acc, goal.assistPlayerId, goal.scorerPlayerId);
      return acc;
    }, new Map<string, number>());
  }

  const badgeRows = await db
    .select({
      playerId: playerBadges.playerId,
      badgeKey: playerBadges.badgeKey,
      goalEventId: playerBadges.goalEventId,
    })
    .from(playerBadges)
    .where(eq(playerBadges.matchId, matchId));

  const badgesByGoalEventId = badgeRows.reduce((acc, badge) => {
    if (badge.goalEventId === null) {
      return acc;
    }

    const existing = acc.get(badge.goalEventId) ?? [];
    existing.push({ playerId: badge.playerId, badgeKey: badge.badgeKey });
    acc.set(badge.goalEventId, existing);
    return acc;
  }, new Map<number, Array<{ playerId: number; badgeKey: string }>>());

  const previousSeasonEarlyGoalsCount = previousSeasonGoals.filter(
    (goal) => !goal.isOwnGoal && isEarlyGoalMinute(goal.minute)
  ).length;
  const previousSeasonLateGoalsByScorer = previousSeasonGoals.reduce((acc, goal) => {
    if (goal.isOwnGoal || !isLateGoalMinute(goal.minute)) {
      return acc;
    }

    incrementMapCounter(acc, goal.scorerPlayerId);
    return acc;
  }, new Map<number, number>());

  const previousSeasonFirstGoalsByScorer = new Map<number, number>();
  const goalsByPreviousSeasonMatchId = new Map<number, GoalEventView[]>();

  for (const goal of previousSeasonGoals) {
    const existing = goalsByPreviousSeasonMatchId.get(goal.matchId) ?? [];
    existing.push(goal);
    goalsByPreviousSeasonMatchId.set(goal.matchId, existing);
  }

  for (const seasonMatchGoals of goalsByPreviousSeasonMatchId.values()) {
    const sortedSeasonMatchGoals = sortGoalsForTimeline(seasonMatchGoals);

    let team1Score = 0;
    let team2Score = 0;

    for (const goal of sortedSeasonMatchGoals) {
      const wasNilNil = team1Score === 0 && team2Score === 0;

      if (goal.teamSide === "team_1") {
        team1Score += 1;
      } else {
        team2Score += 1;
      }

      if (goal.isOwnGoal) {
        continue;
      }

      if (wasNilNil) {
        incrementMapCounter(previousSeasonFirstGoalsByScorer, goal.scorerPlayerId);
      }
    }
  }

  const team1Participants = participantRows.filter((row) => row.teamSide === "team_1");
  const team2Participants = participantRows.filter((row) => row.teamSide === "team_2");

  const team1Goals = sortedGoals.filter((goal) => goal.teamSide === "team_1").length;
  const team2Goals = sortedGoals.filter((goal) => goal.teamSide === "team_2").length;
  const totalGoals = team1Goals + team2Goals;

  const previousMatches = await db
    .select({
      id: matches.id,
      team1Name: matches.team1Name,
      team2Name: matches.team2Name,
      team1Goals: matches.team1Score,
      team2Goals: matches.team2Score,
    })
    .from(matches)
    .where(
      and(
        lt(matches.matchDate, match.matchDate),
        or(
          eq(matches.team1Name, match.team1Name),
          eq(matches.team2Name, match.team1Name),
          eq(matches.team1Name, match.team2Name),
          eq(matches.team2Name, match.team2Name)
        )
      )
    )
    .orderBy(desc(matches.matchDate))
    .limit(30);

  const previousMatchIds = previousMatches.map((previousMatch) => previousMatch.id);
  const previousGoals =
    previousMatchIds.length > 0
      ? await db
          .select({
            matchId: goalEvents.matchId,
            isOwnGoal: goalEvents.isOwnGoal,
            scorerPlayerId: goalEvents.scorerPlayerId,
            assistPlayerId: goalEvents.assistPlayerId,
          })
          .from(goalEvents)
          .where(inArray(goalEvents.matchId, previousMatchIds))
          .catch(async () => {
            const legacyGoals = await db
              .select({
                matchId: goalEvents.matchId,
                scorerPlayerId: goalEvents.scorerPlayerId,
                assistPlayerId: goalEvents.assistPlayerId,
              })
              .from(goalEvents)
              .where(inArray(goalEvents.matchId, previousMatchIds));

            return legacyGoals.map((goal) => ({
              ...goal,
              isOwnGoal: false,
            }));
          })
      : [];

  const previousScorerIdsByMatchId = new Map<number, number[]>();
  const previousAssistIdsByMatchId = new Map<number, number[]>();

  for (const goal of previousGoals) {
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

  const ownGoalsCount = sortedGoals.filter((goal) => goal.isOwnGoal).length;
  const assistsCount = sortedGoals.filter((goal) => !goal.isOwnGoal && goal.assistPlayerId !== null).length;

  const goalsByPlayerId = new Map<number, number>();
  const assistsByPlayerId = new Map<number, number>();

  for (const goal of sortedGoals) {
    if (!goal.isOwnGoal) {
      goalsByPlayerId.set(goal.scorerPlayerId, (goalsByPlayerId.get(goal.scorerPlayerId) ?? 0) + 1);
    }
    if (!goal.isOwnGoal && goal.assistPlayerId !== null) {
      assistsByPlayerId.set(goal.assistPlayerId, (assistsByPlayerId.get(goal.assistPlayerId) ?? 0) + 1);
    }
  }

  const timelineState = sortedGoals.reduce(
    (acc, goal) => {
      const wasNilNil = acc.team1 === 0 && acc.team2 === 0;
      const team1 = acc.team1 + (goal.teamSide === "team_1" ? 1 : 0);
      const team2 = acc.team2 + (goal.teamSide === "team_2" ? 1 : 0);
      const statisticNotes: string[] = [];
      const firstGoalsByScorer = new Map(acc.firstGoalsByScorer);
      const assistCombosModern = new Map(acc.assistCombosModern);
      const seasonLateGoalsByScorer = new Map(acc.seasonLateGoalsByScorer);
      let seasonEarlyGoals = acc.seasonEarlyGoals;

      if (!goal.isOwnGoal) {
        if (isEarlyGoalMinute(goal.minute)) {
          seasonEarlyGoals += 1;
          if (seasonEarlyGoals % 10 === 0) {
            statisticNotes.push(
              `📊 Bereits das ${seasonEarlyGoals}. Tor in den ersten 15 Minuten in dieser Saison.`
            );
          } else {
            statisticNotes.push(
              `📊 Saisonzähler: ${seasonEarlyGoals}. Tor in den ersten 15 Minuten.`
            );
          }
        }

        const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;

        if (isLateGoalMinute(goal.minute)) {
          const scorerLateGoals = incrementMapCounter(seasonLateGoalsByScorer, goal.scorerPlayerId);
          if (scorerLateGoals % 10 === 0) {
            statisticNotes.push(
              `📊 Bereits das ${scorerLateGoals}. Tor in den letzten 15 Minuten in dieser Saison für ${scorerName}.`
            );
          } else {
            statisticNotes.push(
              `📊 Saisonzähler: ${scorerLateGoals}. Tor in den letzten 15 Minuten für ${scorerName}.`
            );
          }
        }

        if (wasNilNil) {
          const firstGoalCount = incrementMapCounter(firstGoalsByScorer, goal.scorerPlayerId);
          const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;

          if (firstGoalCount >= 5) {
            statisticNotes.push(
              `🎯 Das ist ${getGermanPossessiveName(scorerName)} ${firstGoalCount}. 1:0 in dieser Saison.`
            );
          } else {
            statisticNotes.push(
              `🎯 Saisonzähler: ${getGermanPossessiveName(scorerName)} ${firstGoalCount}. 1:0 in dieser Saison.`
            );
          }
        }

        if (goal.assistPlayerId !== null) {
          const assistName = playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`;

          const comboCount = incrementComboCounter(
            assistCombosModern,
            goal.assistPlayerId,
            goal.scorerPlayerId
          );

          if (comboCount >= 5) {
            const assistName = playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`;
            const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
            statisticNotes.push(
              `🅰️ ${assistName} hat ${scorerName} bereits zum ${comboCount}. Mal ein Tor aufgelegt.`
            );
          } else {
            const assistName = playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`;
            const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
            statisticNotes.push(
              `🅰️ Saisonzähler: ${assistName} auf ${scorerName} zum ${comboCount}. Mal.`
            );
          }
        }

        const goalBadges = badgesByGoalEventId.get(goal.id) ?? [];
        for (const badge of goalBadges) {
          const badgePlayerName = playerNameById.get(badge.playerId) ?? `Spieler #${badge.playerId}`;
          const badgeMeta = getBadgeMeta(badge.badgeKey);
          statisticNotes.push(`🏅 Badge geholt: ${badgePlayerName} – ${badgeMeta.emoji} ${badgeMeta.label}.`);
        }
      }

      return {
        team1,
        team2,
        seasonEarlyGoals,
        seasonLateGoalsByScorer,
        firstGoalsByScorer,
        assistCombosModern,
        goals: [...acc.goals, { ...goal, scoreAfterGoal: `${team1}:${team2}`, statisticNotes }],
      };
    },
    {
      team1: 0,
      team2: 0,
      seasonEarlyGoals: previousSeasonEarlyGoalsCount,
      seasonLateGoalsByScorer: new Map(previousSeasonLateGoalsByScorer),
      firstGoalsByScorer: new Map(previousSeasonFirstGoalsByScorer),
      assistCombosModern: new Map(previousAssistCombosModern),
      goals: [] as TimelineGoalView[],
    }
  );

  const insights = buildMatchStory({
    match: {
      team1Name: match.team1Name,
      team2Name: match.team2Name,
      team1Goals,
      team2Goals,
      mvpPlayerId: match.mvpPlayerId,
      mvpName:
        match.mvpPlayerId !== null
          ? (playerNameById.get(match.mvpPlayerId) ?? `Spieler #${match.mvpPlayerId}`)
          : null,
    },
    goals: sortedGoals.map((goal) => ({
      teamSide: goal.teamSide,
      isOwnGoal: goal.isOwnGoal,
      scorerPlayerId: goal.scorerPlayerId,
      scorerName: playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`,
      assistPlayerId: goal.assistPlayerId,
      assistName:
        goal.assistPlayerId !== null
          ? (playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`)
          : null,
    })),
    weather: {
      conditionLabel: match.weatherCondition,
      temperatureC: match.weatherTemperatureC,
      precipMm: match.weatherPrecipMm,
    },
    previousMatches: previousMatches.map((previousMatch) => ({
      team1Name: previousMatch.team1Name,
      team2Name: previousMatch.team2Name,
      team1Goals: previousMatch.team1Goals,
      team2Goals: previousMatch.team2Goals,
      scorerPlayerIds: previousScorerIdsByMatchId.get(previousMatch.id) ?? [],
      assistPlayerIds: previousAssistIdsByMatchId.get(previousMatch.id) ?? [],
    })),
  });

  async function saveMVP(formData: FormData) {
    "use server";

    if (!mvpColumnAvailable) {
      redirect(`/admin/matches/${routeParams.id}?error=1`);
    }

    const submittedMatchId = Number(formData.get("matchId"));
    if (!Number.isInteger(submittedMatchId)) {
      redirect(`/admin/matches/${routeParams.id}?error=1`);
    }

    const mvpPlayerIdRaw = String(formData.get("mvpPlayerId") ?? "").trim();
    const mvpPlayerId = mvpPlayerIdRaw ? Number(mvpPlayerIdRaw) : null;

    try {
      await updateMatchMVP(submittedMatchId, mvpPlayerId);
      redirect(`/admin/matches/${submittedMatchId}?success=1`);
    } catch {
      redirect(`/admin/matches/${submittedMatchId}?error=1`);
    }
  }

  async function deleteMatch(formData: FormData) {
    "use server";

    const submittedMatchId = Number(formData.get("matchId"));
    const confirmation = String(formData.get("confirmDelete") ?? "");

    let targetPath = `/admin/matches/${routeParams.id}?deleteError=1`;

    if (!Number.isInteger(submittedMatchId) || confirmation !== "yes") {
      redirect(targetPath);
    }

    try {
      await deleteMatchById(submittedMatchId);
      targetPath = "/admin/matches";
    } catch {
      targetPath = `/admin/matches/${submittedMatchId}?deleteError=1`;
    }

    redirect(targetPath);
  }

  const mvpName =
    match.mvpPlayerId !== null
      ? (playerNameById.get(match.mvpPlayerId) ?? `Spieler #${match.mvpPlayerId}`)
      : "Noch kein MVP gewählt";

  const weatherPresentation = getWeatherPresentation({
    conditionLabel: match.weatherCondition,
    temperatureC: match.weatherTemperatureC,
    precipMm: match.weatherPrecipMm,
    windKmh: match.weatherWindKmh,
  });

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <p className="text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zur Match-Übersicht</Link>
        </p>

        <section className="rounded-3xl border border-zinc-300 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Matchcenter</p>

          <div className="mt-5 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Team 1</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{match.team1Name}</h1>
            </div>

            <div className="text-center">
              <p className="text-5xl font-black leading-none text-red-400 sm:text-7xl">
                {team1Goals} : {team2Goals}
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">Endstand</p>
            </div>

            <div className="md:text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Team 2</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{match.team2Name}</h2>
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-300 pt-5">
            <p className="text-sm text-zinc-600">
              {match.matchDate.toLocaleDateString("de-DE")} · {match.seasonName ?? "Keine Saison"}
            </p>
            <p className="mt-2 text-base font-medium text-zinc-900">🏆 MVP: {mvpName}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Wetter</h2>

          {!weatherTableAvailable ? (
            <p className="text-sm text-amber-700">Wetterdaten sind in dieser Datenbank noch nicht verfügbar (Migration fehlt).</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Bedingung</p>
                <p className={`mt-1 text-base font-semibold ${weatherPresentation.className}`}>
                  {weatherPresentation.icon} {weatherPresentation.label}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Temperatur</p>
                <p className="mt-1 text-base font-semibold">
                  {match.weatherTemperatureC !== null ? `${match.weatherTemperatureC.toFixed(1)}°C` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Gefühlt</p>
                <p className="mt-1 text-base font-semibold">
                  {match.weatherFeelsLikeC !== null ? `${match.weatherFeelsLikeC.toFixed(1)}°C` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Niederschlag</p>
                <p className="mt-1 text-base font-semibold">
                  {match.weatherPrecipMm !== null ? `${match.weatherPrecipMm.toFixed(1)} mm` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Wind</p>
                <p className="mt-1 text-base font-semibold">
                  {match.weatherWindKmh !== null ? `${match.weatherWindKmh.toFixed(1)} km/h` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <p className="text-zinc-500">Luftfeuchtigkeit</p>
                <p className="mt-1 text-base font-semibold">
                  {match.weatherHumidityPct !== null ? `${match.weatherHumidityPct}%` : "—"}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">Spiel-Insights</h2>
          {insights.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Insights verfügbar.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {insights.map((insight, index) => (
                <li key={`${insight}-${index}`} className="rounded-xl border border-zinc-300 bg-stone-50 px-3 py-2.5">
                  {insight}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-5">
          <h2 className="mb-5 text-lg font-semibold">Spielverlauf</h2>

          {timelineState.goals.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine Tore erfasst.</p>
          ) : (
            <ul className="relative space-y-4 pl-5 before:absolute before:bottom-1 before:left-[10px] before:top-1 before:w-px before:bg-zinc-300">
              {timelineState.goals.map((goal) => {
                const teamName = goal.teamSide === "team_1" ? match.team1Name : match.team2Name;
                const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
                const assistName =
                  !goal.isOwnGoal && goal.assistPlayerId !== null
                    ? (playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`)
                    : null;
                const isTeam1 = goal.teamSide === "team_1";

                return (
                  <li key={goal.id} className="relative">
                    <span className="absolute left-[-14px] top-5 h-2.5 w-2.5 rounded-full bg-red-400" />

                    <article
                      className={`rounded-xl border px-4 py-3 ${
                        isTeam1
                          ? "border-sky-200 bg-sky-50"
                          : "border-rose-200 bg-rose-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-900">
                          {goal.minute !== null ? `${goal.minute}'` : "—"} · {teamName}
                        </p>
                        <p className="text-xs text-zinc-500">Zwischenstand {goal.scoreAfterGoal}</p>
                      </div>

                      <p className="mt-2 text-sm text-zinc-800">
                        {goal.isOwnGoal ? (
                          <>
                            ⚽ <span className="font-medium text-red-700">Eigentor</span> ({scorerName})
                          </>
                        ) : (
                          <>
                            ⚽ <span className="font-medium text-zinc-900">{scorerName}</span>
                            {assistName ? <span className="text-zinc-600"> (Assist: {assistName})</span> : null}
                          </>
                        )}
                        {goal.goalType ? <span className="text-zinc-500"> · {goal.goalType}</span> : null}
                      </p>

                      {goal.statisticNotes.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                          {goal.statisticNotes.map((note, index) => (
                            <li key={`${goal.id}-stat-${index}`}>{note}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[{ name: match.team1Name, rows: team1Participants }, { name: match.team2Name, rows: team2Participants }].map(
            (team) => (
              <article key={team.name} className="rounded-2xl border border-zinc-300 bg-white p-5">
                <h2 className="mb-4 text-lg font-semibold">{team.name}</h2>
                {team.rows.length === 0 ? (
                  <p className="text-sm text-zinc-500">Keine Teilnehmer erfasst.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {team.rows.map((participant) => {
                      const goals = goalsByPlayerId.get(participant.playerId) ?? 0;
                      const assists = assistsByPlayerId.get(participant.playerId) ?? 0;
                      const isMvp = match.mvpPlayerId === participant.playerId;

                      return (
                        <li
                          key={participant.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2"
                        >
                          <span>{participant.playerName}</span>
                          <span className="text-zinc-600">
                            {goals > 0 ? `⚽${goals}` : ""}
                            {assists > 0 ? ` ${assists === 1 ? "🅰️" : `🅰️${assists}`}` : ""}
                            {isMvp ? " 🏆" : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            )
          )}
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Match-Zusammenfassung</h2>

          {!ownGoalColumnAvailable ? (
            <p className="mb-3 text-sm text-amber-700">
              Eigentor-Daten sind in dieser Datenbank noch nicht verfügbar (Migration fehlt).
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
              <p className="text-zinc-500">Tore gesamt</p>
              <p className="mt-1 text-xl font-semibold">{totalGoals}</p>
            </div>
            <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
              <p className="text-zinc-500">Assists</p>
              <p className="mt-1 text-xl font-semibold">{assistsCount}</p>
            </div>
            <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
              <p className="text-zinc-500">Eigentore</p>
              <p className="mt-1 text-xl font-semibold">{ownGoalsCount}</p>
            </div>
            <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
              <p className="text-zinc-500">{match.team1Name}</p>
              <p className="mt-1 text-xl font-semibold">{team1Goals}</p>
            </div>
            <div className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
              <p className="text-zinc-500">{match.team2Name}</p>
              <p className="mt-1 text-xl font-semibold">{team2Goals}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-300 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">Aktionen</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            {isAdmin ? (
              <>
                <Link
                  href={`/admin/matches/${match.id}/goals`}
                  className="rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 hover:border-zinc-500"
                >
                  Tore bearbeiten
                </Link>
                <Link
                  href={`/admin/matches/${match.id}/participants`}
                  className="rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 hover:border-zinc-500"
                >
                  Teilnehmer bearbeiten
                </Link>
              </>
            ) : null}
            <Link
              href="/admin/matches"
              className="rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 hover:border-zinc-500"
            >
              Zurück zur Übersicht
            </Link>
          </div>

          {isAdmin ? (
            <div className="mt-5 border-t border-zinc-300 pt-5">
              <p className="mb-2 text-sm text-zinc-600">MVP verwalten</p>

              {!mvpColumnAvailable ? (
                <p className="text-sm text-amber-700">MVP ist in dieser Datenbank noch nicht verfügbar (Migration fehlt).</p>
              ) : (
                <>
                  {queryParams.success === "1" ? <p className="mb-2 text-sm text-green-700">MVP wurde gespeichert.</p> : null}
                  {queryParams.error === "1" ? <p className="mb-2 text-sm text-red-700">MVP konnte nicht gespeichert werden.</p> : null}

                  <form action={saveMVP} className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
                    <input type="hidden" name="matchId" value={match.id} />
                    <select
                      name="mvpPlayerId"
                      defaultValue={match.mvpPlayerId !== null ? String(match.mvpPlayerId) : ""}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="">Kein MVP</option>
                      {participantRows.map((participant) => (
                        <option key={participant.playerId} value={participant.playerId}>
                          {participant.playerName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="w-fit rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2 text-sm hover:border-zinc-500"
                    >
                      Speichern
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : null}

          {isAdmin ? (
            <div className="mt-5 border-t border-zinc-300 pt-5">
              <p className="mb-2 text-sm text-zinc-600">Spiel löschen</p>
              {queryParams.deleteError === "1" ? (
                <p className="mb-2 text-sm text-red-700">Spiel konnte nicht gelöscht werden.</p>
              ) : null}

              <form action={deleteMatch} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="matchId" value={match.id} />
                <label className="inline-flex items-center gap-2 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    name="confirmDelete"
                    value="yes"
                    required
                    className="h-4 w-4 rounded border-zinc-300 bg-white"
                  />
                  Löschung bestätigen
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:border-red-500"
                >
                  Spiel löschen
                </button>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}