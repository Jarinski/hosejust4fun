import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  matchParticipants,
  matches,
  matchWeather,
  players,
  seasons,
} from "@/src/db/schema";
import { getAdminSession, requireAdminInAction } from "@/src/lib/auth";
import { isRainLikeWeather, isSunnyLikeWeather } from "@/src/lib/weatherIcons";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string }>;
};

type WeatherMatchRow = {
  matchId: number;
  temperatureC: number | null;
  precipMm: number | null;
  conditionLabel: string | null;
  mvpPlayerId: number | null;
};

type GoalRow = {
  matchId: number;
  scorerPlayerId: number;
  assistPlayerId: number | null;
  isOwnGoal: boolean;
};

type GoalTimelineRow = {
  id: number;
  matchId: number;
  teamSide: "team_1" | "team_2";
  scorerPlayerId: number;
  minute: number | null;
  isOwnGoal: boolean;
};

type DuoWithPlayer = {
  teammateId: number;
  gamesTogether: number;
  teamGoals: number;
  goalsAgainst: number;
};

type TrioWithPlayer = {
  teammate1Id: number;
  teammate2Id: number;
  gamesTogether: number;
  teamGoals: number;
  goalsAgainst: number;
};

type SeasonalParticipationRow = {
  seasonId: number;
  playerId: number;
  teamSide: "team_1" | "team_2";
  team1Score: number;
  team2Score: number;
};

type SeasonalGoalCountRow = {
  seasonId: number;
  playerId: number;
  goals: number;
};

type SeasonalAssistCountRow = {
  seasonId: number;
  playerId: number;
  assists: number;
};

type SeasonalPlayerStat = {
  seasonId: number;
  playerId: number;
  appearances: number;
  teamGoals: number;
  goalsAgainst: number;
  goals: number;
  assists: number;
};

type PlayerTitleKey =
  | "top_goalscorer"
  | "top_assist"
  | "top_scorer"
  | "defensive_wall"
  | "driving_force";

type PlayerAward = {
  seasonId: number;
  seasonName: string;
  seasonStartDate: string;
  playerId: number;
  titleKey: PlayerTitleKey;
  titleLabel: string;
  valueLabel: string;
};

const MIN_APPEARANCES_FOR_RATE_TITLES = 3;

const TITLE_LABELS: Record<PlayerTitleKey, string> = {
  top_goalscorer: "Torschützenkönig",
  top_assist: "Assistkönig",
  top_scorer: "Topscorer",
  defensive_wall: "Abwehrbollwerk",
  driving_force: "Antreiber",
};

const RATE_EPSILON = 1e-9;

function areRatesEqual(a: number, b: number) {
  return Math.abs(a - b) <= RATE_EPSILON;
}

async function loadSeasonalGoalCounts(): Promise<SeasonalGoalCountRow[]> {
  try {
    return await db
      .select({
        seasonId: matches.seasonId,
        playerId: goalEvents.scorerPlayerId,
        goals: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(eq(goalEvents.isOwnGoal, false))
      .groupBy(matches.seasonId, goalEvents.scorerPlayerId);
  } catch {
    return await db
      .select({
        seasonId: matches.seasonId,
        playerId: goalEvents.scorerPlayerId,
        goals: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .groupBy(matches.seasonId, goalEvents.scorerPlayerId);
  }
}

async function loadSeasonalAssistCounts(): Promise<SeasonalAssistCountRow[]> {
  try {
    const rows = await db
      .select({
        seasonId: matches.seasonId,
        playerId: goalEvents.assistPlayerId,
        assists: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(eq(goalEvents.isOwnGoal, false), isNotNull(goalEvents.assistPlayerId)))
      .groupBy(matches.seasonId, goalEvents.assistPlayerId);

    return rows.map((row) => ({
      seasonId: row.seasonId,
      playerId: row.playerId as number,
      assists: Number(row.assists) || 0,
    }));
  } catch {
    const rows = await db
      .select({
        seasonId: matches.seasonId,
        playerId: goalEvents.assistPlayerId,
        assists: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(isNotNull(goalEvents.assistPlayerId))
      .groupBy(matches.seasonId, goalEvents.assistPlayerId);

    return rows.map((row) => ({
      seasonId: row.seasonId,
      playerId: row.playerId as number,
      assists: Number(row.assists) || 0,
    }));
  }
}

function isRainMatch(match: WeatherMatchRow) {
  return isRainLikeWeather({
    conditionLabel: match.conditionLabel,
    precipMm: match.precipMm,
  });
}

function isColdMatch(match: WeatherMatchRow) {
  return match.temperatureC !== null && match.temperatureC < 10;
}

function isSunnyMatch(match: WeatherMatchRow) {
  return isSunnyLikeWeather({
    conditionLabel: match.conditionLabel,
    precipMm: match.precipMm,
    temperatureC: match.temperatureC,
  });
}

function isBadWeatherMatch(match: WeatherMatchRow) {
  return isRainMatch(match) || isColdMatch(match);
}

async function loadGoalsForMatches(matchIds: number[]): Promise<GoalRow[]> {
  if (matchIds.length === 0) {
    return [];
  }

  try {
    return await db
      .select({
        matchId: goalEvents.matchId,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        isOwnGoal: goalEvents.isOwnGoal,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds));
  } catch {
    const legacyGoals = await db
      .select({
        matchId: goalEvents.matchId,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds));

    return legacyGoals.map((goal) => ({ ...goal, isOwnGoal: false }));
  }
}

async function loadGoalTimelineForMatches(matchIds: number[]): Promise<GoalTimelineRow[]> {
  if (matchIds.length === 0) {
    return [];
  }

  try {
    return await db
      .select({
        id: goalEvents.id,
        matchId: goalEvents.matchId,
        teamSide: goalEvents.teamSide,
        scorerPlayerId: goalEvents.scorerPlayerId,
        minute: goalEvents.minute,
        isOwnGoal: goalEvents.isOwnGoal,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds))
      .orderBy(asc(goalEvents.matchId), asc(goalEvents.id));
  } catch {
    const legacyRows = await db
      .select({
        id: goalEvents.id,
        matchId: goalEvents.matchId,
        teamSide: goalEvents.teamSide,
        scorerPlayerId: goalEvents.scorerPlayerId,
        minute: goalEvents.minute,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds))
      .orderBy(asc(goalEvents.matchId), asc(goalEvents.id));

    return legacyRows.map((row) => ({ ...row, isOwnGoal: false }));
  }
}

function buildWeatherSummary(values: {
  rainGoals: number;
  coldGoals: number;
  sunnyGoals: number;
  rainAssists: number;
  badWeatherMvps: number;
}) {
  const buckets = [
    { label: "Regen", score: values.rainGoals + values.rainAssists },
    { label: "Kälte", score: values.coldGoals },
    { label: "Schönwetter", score: values.sunnyGoals },
  ].sort((a, b) => b.score - a.score);

  if (values.badWeatherMvps >= 2) {
    return "Schlechtwetter-Leader: Mehrfach-MVP bei harten Bedingungen.";
  }

  if (buckets[0].score > 0 && buckets[0].score > buckets[1].score) {
    return `Lieblingsbedingungen: ${buckets[0].label}.`;
  }

  if (values.sunnyGoals > 0 && values.sunnyGoals >= values.rainGoals + values.coldGoals) {
    return "Stark bei Schönwetter.";
  }

  return null;
}

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  const routeParams = await params;
  const pageSearchParams = await searchParams;
  const playerId = Number(routeParams.id);
  const isAdmin = Boolean(await getAdminSession());
  const pageError = pageSearchParams?.error;
  const wasUpdated = pageSearchParams?.updated === "1";

  if (!Number.isInteger(playerId)) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/stats" className="hover:text-zinc-900">← Zurück zu Statistiken</Link>
          </p>
          <h1 className="mb-2 text-xl font-semibold">Spieler</h1>
          <p className="text-zinc-500">Ungültige Spieler-ID.</p>
        </section>
      </main>
    );
  }

  const playerRows = await (async () => {
    try {
      return await db
        .select({
          id: players.id,
          name: players.name,
          isGoalkeeper: players.isGoalkeeper,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
    } catch {
      // Fallback für Umgebungen, in denen die Migration für is_goalkeeper noch nicht gelaufen ist.
      const legacyRows = await db
        .select({
          id: players.id,
          name: players.name,
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);

      return legacyRows.map((row) => ({
        ...row,
        isGoalkeeper: false,
      }));
    }
  })();

  const player = playerRows[0];

  if (!player) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/stats" className="hover:text-zinc-900">← Zurück zu Statistiken</Link>
          </p>
          <h1 className="mb-2 text-xl font-semibold">Spieler nicht gefunden</h1>
          <p className="text-zinc-500">Zu dieser ID gibt es keinen Spieler.</p>
        </section>
      </main>
    );
  }

  const [seasonRows, seasonParticipationRows, seasonalGoalRows, seasonalAssistRows] =
    await Promise.all([
      db
        .select({
          id: seasons.id,
          name: seasons.name,
          startDate: seasons.startDate,
        })
        .from(seasons)
        .orderBy(desc(seasons.startDate), desc(seasons.id)),
      db
        .select({
          seasonId: matches.seasonId,
          playerId: matchParticipants.playerId,
          teamSide: matchParticipants.teamSide,
          team1Score: matches.team1Score,
          team2Score: matches.team2Score,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id)),
      loadSeasonalGoalCounts(),
      loadSeasonalAssistCounts(),
    ]);

  const seasonalStatsByKey = new Map<string, SeasonalPlayerStat>();
  const getSeasonalStats = (seasonId: number, targetPlayerId: number) => {
    const key = `${seasonId}-${targetPlayerId}`;
    const existing = seasonalStatsByKey.get(key);
    if (existing) {
      return existing;
    }

    const created: SeasonalPlayerStat = {
      seasonId,
      playerId: targetPlayerId,
      appearances: 0,
      teamGoals: 0,
      goalsAgainst: 0,
      goals: 0,
      assists: 0,
    };
    seasonalStatsByKey.set(key, created);
    return created;
  };

  for (const row of seasonParticipationRows as SeasonalParticipationRow[]) {
    const stat = getSeasonalStats(row.seasonId, row.playerId);
    stat.appearances += 1;
    stat.teamGoals += row.teamSide === "team_1" ? row.team1Score : row.team2Score;
    stat.goalsAgainst += row.teamSide === "team_1" ? row.team2Score : row.team1Score;
  }

  for (const row of seasonalGoalRows) {
    const stat = getSeasonalStats(row.seasonId, row.playerId);
    stat.goals = Number(row.goals) || 0;
  }

  for (const row of seasonalAssistRows) {
    const stat = getSeasonalStats(row.seasonId, row.playerId);
    stat.assists = Number(row.assists) || 0;
  }

  const allSeasonalStats = Array.from(seasonalStatsByKey.values());
  const awards: PlayerAward[] = [];

  const addAwardsForWinners = (
    season: (typeof seasonRows)[number],
    titleKey: PlayerTitleKey,
    winners: SeasonalPlayerStat[],
    valueLabelForStat: (stat: SeasonalPlayerStat) => string,
  ) => {
    for (const winner of winners) {
      awards.push({
        seasonId: season.id,
        seasonName: season.name,
        seasonStartDate: String(season.startDate),
        playerId: winner.playerId,
        titleKey,
        titleLabel: TITLE_LABELS[titleKey],
        valueLabel: valueLabelForStat(winner),
      });
    }
  };

  for (const season of seasonRows) {
    const seasonStats = allSeasonalStats.filter((row) => row.seasonId === season.id);
    if (seasonStats.length === 0) {
      continue;
    }

    const maxGoals = Math.max(...seasonStats.map((row) => row.goals));
    if (maxGoals > 0) {
      addAwardsForWinners(
        season,
        "top_goalscorer",
        seasonStats.filter((row) => row.goals === maxGoals),
        (row) => `${row.goals} Tore`,
      );
    }

    const maxAssists = Math.max(...seasonStats.map((row) => row.assists));
    if (maxAssists > 0) {
      addAwardsForWinners(
        season,
        "top_assist",
        seasonStats.filter((row) => row.assists === maxAssists),
        (row) => `${row.assists} Assists`,
      );
    }

    const maxPoints = Math.max(...seasonStats.map((row) => row.goals + row.assists));
    if (maxPoints > 0) {
      addAwardsForWinners(
        season,
        "top_scorer",
        seasonStats.filter((row) => row.goals + row.assists === maxPoints),
        (row) => `${row.goals + row.assists} Scorerpunkte`,
      );
    }

    const eligibleForRateTitles = seasonStats.filter(
      (row) => row.appearances >= MIN_APPEARANCES_FOR_RATE_TITLES,
    );

    if (eligibleForRateTitles.length > 0) {
      const minConcededPerGame = Math.min(
        ...eligibleForRateTitles.map((row) => row.goalsAgainst / row.appearances),
      );

      addAwardsForWinners(
        season,
        "defensive_wall",
        eligibleForRateTitles.filter(
          (row) => areRatesEqual(row.goalsAgainst / row.appearances, minConcededPerGame),
        ),
        (row) => `${(row.goalsAgainst / row.appearances).toFixed(2)} GT/Spiel`,
      );

      const maxTeamGoalsPerGame = Math.max(
        ...eligibleForRateTitles.map((row) => row.teamGoals / row.appearances),
      );

      addAwardsForWinners(
        season,
        "driving_force",
        eligibleForRateTitles.filter(
          (row) => areRatesEqual(row.teamGoals / row.appearances, maxTeamGoalsPerGame),
        ),
        (row) => `${(row.teamGoals / row.appearances).toFixed(2)} Teamtore/Spiel`,
      );
    }
  }

  const playerSeasonalAwards = awards
    .filter((award) => award.playerId === playerId)
    .sort((a, b) => {
      const seasonOrder = b.seasonStartDate.localeCompare(a.seasonStartDate);
      if (seasonOrder !== 0) return seasonOrder;
      return a.titleLabel.localeCompare(b.titleLabel, "de");
    });

  const careerTitleCounts = new Map<PlayerTitleKey, number>();
  for (const award of playerSeasonalAwards) {
    careerTitleCounts.set(award.titleKey, (careerTitleCounts.get(award.titleKey) ?? 0) + 1);
  }

  const careerSummaryItems = (Object.keys(TITLE_LABELS) as PlayerTitleKey[])
    .map((titleKey) => ({
      titleKey,
      titleLabel: TITLE_LABELS[titleKey],
      count: careerTitleCounts.get(titleKey) ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.titleLabel.localeCompare(b.titleLabel, "de"));

  const gameCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchParticipants)
    .where(eq(matchParticipants.playerId, playerId));

  const participationRows = await db
    .select({
      matchId: matchParticipants.matchId,
      teamSide: matchParticipants.teamSide,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(eq(matchParticipants.playerId, playerId));

  const goalCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(goalEvents)
    .where(eq(goalEvents.scorerPlayerId, playerId));

  const assistCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(goalEvents)
    .where(eq(goalEvents.assistPlayerId, playerId));

  const recentMatches = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Name: matches.team1Name,
      team2Name: matches.team2Name,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(eq(matchParticipants.playerId, playerId))
    .orderBy(desc(matches.matchDate), desc(matches.id))
    .limit(10);

  const weatherMatches = await db
    .select({
      matchId: matchParticipants.matchId,
      temperatureC: matchWeather.temperatureC,
      precipMm: matchWeather.precipMm,
      conditionLabel: matchWeather.conditionLabel,
      mvpPlayerId: matches.mvpPlayerId,
    })
    .from(matchParticipants)
    .innerJoin(matchWeather, eq(matchParticipants.matchId, matchWeather.matchId))
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(eq(matchParticipants.playerId, playerId));

  const playerMatchIds = Array.from(new Set(participationRows.map((row) => row.matchId)));

  const [allParticipantsForPlayerMatches, allGoalsForPlayerMatches, goalTimelineForPlayerMatches] =
    await Promise.all([
      playerMatchIds.length > 0
        ? db
            .select({
              matchId: matchParticipants.matchId,
              playerId: matchParticipants.playerId,
              teamSide: matchParticipants.teamSide,
            })
            .from(matchParticipants)
            .where(inArray(matchParticipants.matchId, playerMatchIds))
        : Promise.resolve([] as Array<{ matchId: number; playerId: number; teamSide: "team_1" | "team_2" }>),
      loadGoalsForMatches(playerMatchIds),
      loadGoalTimelineForMatches(playerMatchIds),
    ]);

  const weatherMatchIds = weatherMatches.map((match) => match.matchId);
  const weatherGoals = await loadGoalsForMatches(weatherMatchIds);

  const rainMatchIdSet = new Set(weatherMatches.filter(isRainMatch).map((match) => match.matchId));
  const coldMatchIdSet = new Set(weatherMatches.filter(isColdMatch).map((match) => match.matchId));
  const sunnyMatchIdSet = new Set(weatherMatches.filter(isSunnyMatch).map((match) => match.matchId));
  const badWeatherMatchIdSet = new Set(
    weatherMatches.filter(isBadWeatherMatch).map((match) => match.matchId),
  );

  let rainGoals = 0;
  let coldGoals = 0;
  let sunnyGoals = 0;
  let rainAssists = 0;
  let sunnyAssists = 0;

  for (const goal of weatherGoals) {
    if (goal.isOwnGoal) {
      continue;
    }

    const isOwnGoalFilteredScorer = goal.scorerPlayerId === playerId;
    const isOwnGoalFilteredAssist = goal.assistPlayerId === playerId;

    if (isOwnGoalFilteredScorer) {
      if (rainMatchIdSet.has(goal.matchId)) rainGoals += 1;
      if (coldMatchIdSet.has(goal.matchId)) coldGoals += 1;
      if (sunnyMatchIdSet.has(goal.matchId)) sunnyGoals += 1;
    }

    if (isOwnGoalFilteredAssist && rainMatchIdSet.has(goal.matchId)) {
      rainAssists += 1;
    }

    if (isOwnGoalFilteredAssist && sunnyMatchIdSet.has(goal.matchId)) {
      sunnyAssists += 1;
    }
  }

  const mvpByMatchId = new Map<number, number | null>();
  for (const match of weatherMatches) {
    if (!mvpByMatchId.has(match.matchId)) {
      mvpByMatchId.set(match.matchId, match.mvpPlayerId);
    }
  }

  let badWeatherMvps = 0;
  for (const matchId of badWeatherMatchIdSet) {
    if (mvpByMatchId.get(matchId) === playerId) {
      badWeatherMvps += 1;
    }
  }

  let sunnyMvps = 0;
  for (const matchId of sunnyMatchIdSet) {
    if (mvpByMatchId.get(matchId) === playerId) {
      sunnyMvps += 1;
    }
  }

  const weatherGames = {
    rain: rainMatchIdSet.size,
    cold: coldMatchIdSet.size,
    sunny: sunnyMatchIdSet.size,
    bad: badWeatherMatchIdSet.size,
  };

  const weatherSummary = buildWeatherSummary({
    rainGoals,
    coldGoals,
    sunnyGoals,
    rainAssists,
    badWeatherMvps,
  });

  const games = gameCountRows[0]?.count ?? 0;
  const goals = goalCountRows[0]?.count ?? 0;
  const assists = assistCountRows[0]?.count ?? 0;

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const row of participationRows) {
    const teamGoals = row.teamSide === "team_1" ? row.team1Score : row.team2Score;
    const conceded = row.teamSide === "team_1" ? row.team2Score : row.team1Score;

    if (teamGoals > conceded) wins += 1;
    else if (teamGoals === conceded) draws += 1;
    else losses += 1;
  }

  const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : "0.0";

  const participantsByMatchAndTeam = new Map<string, number[]>();
  for (const participant of allParticipantsForPlayerMatches) {
    const key = `${participant.matchId}-${participant.teamSide}`;
    const current = participantsByMatchAndTeam.get(key) ?? [];
    current.push(participant.playerId);
    participantsByMatchAndTeam.set(key, current);
  }

  const duoWithPlayerStats = new Map<number, DuoWithPlayer>();
  const trioWithPlayerStats = new Map<string, TrioWithPlayer>();

  for (const row of participationRows) {
    const key = `${row.matchId}-${row.teamSide}`;
    const teammates = (participantsByMatchAndTeam.get(key) ?? []).filter((id) => id !== playerId);
    const teamGoals = row.teamSide === "team_1" ? row.team1Score : row.team2Score;
    const conceded = row.teamSide === "team_1" ? row.team2Score : row.team1Score;

    for (const teammateId of teammates) {
      const current = duoWithPlayerStats.get(teammateId) ?? {
        teammateId,
        gamesTogether: 0,
        teamGoals: 0,
        goalsAgainst: 0,
      };

      current.gamesTogether += 1;
      current.teamGoals += teamGoals;
      current.goalsAgainst += conceded;
      duoWithPlayerStats.set(teammateId, current);
    }

    const sortedTeammates = [...new Set(teammates)].sort((a, b) => a - b);
    for (let i = 0; i < sortedTeammates.length - 1; i++) {
      for (let j = i + 1; j < sortedTeammates.length; j++) {
        const teammate1Id = sortedTeammates[i];
        const teammate2Id = sortedTeammates[j];
        const trioKey = `${teammate1Id}-${teammate2Id}`;

        const current = trioWithPlayerStats.get(trioKey) ?? {
          teammate1Id,
          teammate2Id,
          gamesTogether: 0,
          teamGoals: 0,
          goalsAgainst: 0,
        };

        current.gamesTogether += 1;
        current.teamGoals += teamGoals;
        current.goalsAgainst += conceded;
        trioWithPlayerStats.set(trioKey, current);
      }
    }
  }

  const goalTimelineSorted = [...goalTimelineForPlayerMatches].sort((a, b) => {
    if (a.matchId !== b.matchId) return a.matchId - b.matchId;
    const minuteA = a.minute ?? 999;
    const minuteB = b.minute ?? 999;
    if (minuteA !== minuteB) return minuteA - minuteB;
    return a.id - b.id;
  });

  let firstGoalGoals = 0;
  let equalizerGoals = 0;
  let earlyGoals = 0;
  let lateGoals = 0;
  let currentTimelineMatchId: number | null = null;
  let team1ScoreRunning = 0;
  let team2ScoreRunning = 0;

  for (const goal of goalTimelineSorted) {
    if (goal.matchId !== currentTimelineMatchId) {
      currentTimelineMatchId = goal.matchId;
      team1ScoreRunning = 0;
      team2ScoreRunning = 0;
    }

    const wasNilNil = team1ScoreRunning === 0 && team2ScoreRunning === 0;

    if (goal.teamSide === "team_1") {
      team1ScoreRunning += 1;
    } else {
      team2ScoreRunning += 1;
    }

    if (goal.isOwnGoal || goal.scorerPlayerId !== playerId) {
      continue;
    }

    if (wasNilNil) firstGoalGoals += 1;
    if (team1ScoreRunning === team2ScoreRunning) equalizerGoals += 1;
    if (goal.minute !== null && goal.minute >= 0 && goal.minute <= 15) earlyGoals += 1;
    if (goal.minute !== null && goal.minute >= 76) lateGoals += 1;
  }

  const assistsToScorer = new Map<number, number>();
  const assistsFromProvider = new Map<number, number>();

  for (const goal of allGoalsForPlayerMatches) {
    if (goal.isOwnGoal) continue;

    if (goal.scorerPlayerId === playerId && goal.assistPlayerId !== null) {
      assistsToScorer.set(
        goal.assistPlayerId,
        (assistsToScorer.get(goal.assistPlayerId) ?? 0) + 1,
      );
    }

    if (goal.assistPlayerId === playerId) {
      assistsFromProvider.set(
        goal.scorerPlayerId,
        (assistsFromProvider.get(goal.scorerPlayerId) ?? 0) + 1,
      );
    }
  }

  const teammateIds = Array.from(
    new Set([
      ...Array.from(duoWithPlayerStats.keys()),
      ...Array.from(trioWithPlayerStats.values()).flatMap((entry) => [entry.teammate1Id, entry.teammate2Id]),
      ...Array.from(assistsToScorer.keys()),
      ...Array.from(assistsFromProvider.keys()),
    ]),
  );

  const teammateRows = teammateIds.length
    ? await db
        .select({
          id: players.id,
          name: players.name,
        })
        .from(players)
        .where(inArray(players.id, teammateIds))
    : [];

  const teammateNameById = new Map(teammateRows.map((entry) => [entry.id, entry.name]));

  const bestDuoByGames = Array.from(duoWithPlayerStats.values())
    .sort((a, b) => b.gamesTogether - a.gamesTogether || a.teammateId - b.teammateId)[0] ?? null;

  const bestDuoByTeamGoals = Array.from(duoWithPlayerStats.values())
    .sort((a, b) => {
      if (b.teamGoals !== a.teamGoals) return b.teamGoals - a.teamGoals;
      if (b.gamesTogether !== a.gamesTogether) return b.gamesTogether - a.gamesTogether;
      return a.teammateId - b.teammateId;
    })[0] ?? null;

  const worstDuoByGoalsAgainstPerGame = Array.from(duoWithPlayerStats.values())
    .sort((a, b) => {
      const aPerGame = a.gamesTogether > 0 ? a.goalsAgainst / a.gamesTogether : 0;
      const bPerGame = b.gamesTogether > 0 ? b.goalsAgainst / b.gamesTogether : 0;
      if (bPerGame !== aPerGame) return bPerGame - aPerGame;
      if (b.goalsAgainst !== a.goalsAgainst) return b.goalsAgainst - a.goalsAgainst;
      return a.teammateId - b.teammateId;
    })[0] ?? null;

  const bestTrioByTeamGoals = Array.from(trioWithPlayerStats.values())
    .sort((a, b) => {
      if (b.teamGoals !== a.teamGoals) return b.teamGoals - a.teamGoals;
      if (b.gamesTogether !== a.gamesTogether) return b.gamesTogether - a.gamesTogether;
      if (a.teammate1Id !== b.teammate1Id) return a.teammate1Id - b.teammate1Id;
      return a.teammate2Id - b.teammate2Id;
    })[0] ?? null;

  const topAssistProvider = Array.from(assistsToScorer.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? null;

  const topAssistReceiver = Array.from(assistsFromProvider.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? null;

  const goalkeeperGoalsAgainst = participationRows.reduce((sum, row) => {
    const conceded = row.teamSide === "team_1" ? row.team2Score : row.team1Score;
    return sum + conceded;
  }, 0);
  const cleanSheets = participationRows.filter((row) => {
    const conceded = row.teamSide === "team_1" ? row.team2Score : row.team1Score;
    return conceded === 0;
  }).length;
  const goalsAgainstPerGame = games > 0 ? (goalkeeperGoalsAgainst / games).toFixed(2) : "0.00";

  async function updatePlayerDetails(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const targetPlayerId = Number(formData.get("playerId"));
    if (!Number.isInteger(targetPlayerId)) {
      redirect("/admin/players");
    }

    const nameRaw = formData.get("name");
    const name = String(nameRaw ?? "").trim();
    if (!name) {
      redirect(`/admin/players/${targetPlayerId}?error=name`);
    }

    const isGoalkeeper = formData.get("isGoalkeeper") === "on";

    try {
      await db
        .update(players)
        .set({ name, isGoalkeeper })
        .where(eq(players.id, targetPlayerId));
    } catch {
      // Fallback für Umgebungen ohne is_goalkeeper-Spalte.
      await db.update(players).set({ name }).where(eq(players.id, targetPlayerId));
    }

    redirect(`/admin/players/${targetPlayerId}?updated=1`);
  }

  async function deletePlayer(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const targetPlayerId = Number(formData.get("playerId"));
    if (!Number.isInteger(targetPlayerId)) {
      redirect("/admin/players");
    }

    const participantLinks = await db
      .select({ count: sql<number>`count(*)` })
      .from(matchParticipants)
      .where(eq(matchParticipants.playerId, targetPlayerId));

    const goalLinks = await db
      .select({ count: sql<number>`count(*)` })
      .from(goalEvents)
      .where(
        or(
          eq(goalEvents.scorerPlayerId, targetPlayerId),
          eq(goalEvents.assistPlayerId, targetPlayerId),
        ),
      );

    const mvpLinks = await db
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(eq(matches.mvpPlayerId, targetPlayerId));

    const totalLinks =
      (participantLinks[0]?.count ?? 0) +
      (goalLinks[0]?.count ?? 0) +
      (mvpLinks[0]?.count ?? 0);

    if (totalLinks > 0) {
      redirect(`/admin/players/${targetPlayerId}?error=in_use`);
    }

    await db.delete(players).where(eq(players.id, targetPlayerId));

    redirect("/admin/players");
  }

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/stats" className="hover:text-zinc-900">← Zurück zu Statistiken</Link>
        </p>
        <h1 className="mb-4 text-2xl font-semibold">{player.name}</h1>

        <p className="mb-4 inline-flex rounded-full border border-zinc-300 bg-stone-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-zinc-600">
          {player.isGoalkeeper ? "Torhüter" : "Feldspieler"}
        </p>

        <section className="mb-6 rounded-2xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Titel &amp; Badges</h2>
              <p className="text-xs text-zinc-500">
                Saison-Titel mit mindestens {MIN_APPEARANCES_FOR_RATE_TITLES} Einsätzen für Abwehrbollwerk und Antreiber.
              </p>
            </div>
          </div>

          {careerSummaryItems.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {careerSummaryItems.map((entry) => (
                <span
                  key={entry.titleKey}
                  className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700"
                >
                  {entry.count}× {entry.titleLabel}
                </span>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-zinc-500">Noch keine Titel in den erfassten Saisons.</p>
          )}

          {playerSeasonalAwards.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {playerSeasonalAwards.map((award, index) => (
                <li
                  key={`${award.seasonId}-${award.titleKey}-${index}`}
                  className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700"
                >
                  🏆 {award.titleLabel} – {award.seasonName} <span className="ml-1 text-zinc-500">({award.valueLabel})</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {pageError === "name" ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Bitte einen gültigen Namen eingeben.
          </p>
        ) : null}

        {pageError === "in_use" ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Spieler kann nicht gelöscht werden, da bereits Match-/Tor-Daten verknüpft sind.
          </p>
        ) : null}

        {wasUpdated ? (
          <p className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-emerald-300">
            Spieler aktualisiert.
          </p>
        ) : null}

        {isAdmin ? (
          <div className="mb-6 space-y-3">
            <form action={updatePlayerDetails} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-300 bg-stone-50 p-3">
              <input type="hidden" name="playerId" value={player.id} />
              <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm text-zinc-700">
                <span className="text-xs text-zinc-500">Name</span>
                <input
                  type="text"
                  name="name"
                  defaultValue={player.name}
                  required
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="isGoalkeeper"
                  defaultChecked={player.isGoalkeeper}
                  className="h-4 w-4 accent-zinc-900"
                />
                Torhüter
              </label>

              <button
                type="submit"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:border-zinc-500"
              >
                Spieler speichern
              </button>
            </form>

            <form action={deletePlayer} className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
              <input type="hidden" name="playerId" value={player.id} />
              <button
                type="submit"
                className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs text-red-200 hover:border-red-700"
              >
                Spieler löschen
              </button>
            </form>
          </div>
        ) : null}

        {player.isGoalkeeper ? (
          <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Spiele</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{games}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Gegentore</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{goalkeeperGoalsAgainst}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Gegentore / Spiel</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{goalsAgainstPerGame}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Weiße Weste</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{cleanSheets}</p>
            </article>
          </section>
        ) : (
          <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Spiele</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{games}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Tore</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{goals}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Assists</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{assists}</p>
            </article>
          </section>
        )}

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Siege</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{wins}</p>
          </article>
          <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Unentschieden</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{draws}</p>
          </article>
          <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Niederlagen</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{losses}</p>
          </article>
          <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Siegesquote</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{winRate}%</p>
          </article>
        </section>

        <section className="mb-6 rounded-2xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">Tor-Momente</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">1:0 Treffer</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{firstGoalGoals}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Ausgleichstreffer</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{equalizerGoals}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Frühe Tore (0-15&apos;)</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{earlyGoals}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Späte Tore (76+&apos;)</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{lateGoals}</p>
            </article>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">Kombinationen & Teamplay</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Häufigster Duo-Partner (Einsätze)</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {bestDuoByGames
                  ? `${teammateNameById.get(bestDuoByGames.teammateId) ?? `Spieler #${bestDuoByGames.teammateId}`} · ${bestDuoByGames.gamesTogether} Spiele`
                  : "Keine Duo-Daten"}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Stärkstes Duo (Teamtore)</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {bestDuoByTeamGoals
                  ? `${teammateNameById.get(bestDuoByTeamGoals.teammateId) ?? `Spieler #${bestDuoByTeamGoals.teammateId}`} · ${bestDuoByTeamGoals.teamGoals} Tore`
                  : "Keine Duo-Daten"}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Anfälligstes Duo (Gegentore/Spiel)</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {worstDuoByGoalsAgainstPerGame
                  ? `${teammateNameById.get(worstDuoByGoalsAgainstPerGame.teammateId) ?? `Spieler #${worstDuoByGoalsAgainstPerGame.teammateId}`} · ${(worstDuoByGoalsAgainstPerGame.goalsAgainst / Math.max(worstDuoByGoalsAgainstPerGame.gamesTogether, 1)).toFixed(2)}`
                  : "Keine Duo-Daten"}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Stärkstes Trio (Teamtore)</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {bestTrioByTeamGoals
                  ? `${teammateNameById.get(bestTrioByTeamGoals.teammate1Id) ?? `Spieler #${bestTrioByTeamGoals.teammate1Id}`}, ${teammateNameById.get(bestTrioByTeamGoals.teammate2Id) ?? `Spieler #${bestTrioByTeamGoals.teammate2Id}`} · ${bestTrioByTeamGoals.teamGoals} Tore`
                  : "Keine Trio-Daten"}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Top-Vorlagengeber für {player.name}</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {topAssistProvider
                  ? `${teammateNameById.get(topAssistProvider[0]) ?? `Spieler #${topAssistProvider[0]}`} · ${topAssistProvider[1]} Vorlagen`
                  : "Keine Daten"}
              </p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Top-Abnehmer von {player.name}</p>
              <p className="mt-1 text-sm text-zinc-300 font-semibold">
                {topAssistReceiver
                  ? `${teammateNameById.get(topAssistReceiver[0]) ?? `Spieler #${topAssistReceiver[0]}`} · ${topAssistReceiver[1]} Assists`
                  : "Keine Daten"}
              </p>
            </article>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-zinc-300 bg-stone-50 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Wetterprofil</h2>
              <p className="text-xs text-zinc-500">
                Nur gespeicherte Wetterdaten aus <code>match_weather</code>; nur Spiele mit Teilnahme.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🌧️ Tore bei Regen</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{rainGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🥶 Tore unter 10 °C</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{coldGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🌤️ Tore bei Schönwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{sunnyGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🎯 Assists bei Regen</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{rainAssists}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🎯 Assists bei Schönwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{sunnyAssists}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🏆 MVPs bei Schlechtwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{badWeatherMvps}</p>
            </article>

            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-500">🏆 MVPs bei Schönwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{sunnyMvps}</p>
            </article>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-3">
              <p className="text-xs text-zinc-500">Einsätze Regen 🌧️</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{weatherGames.rain}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-3">
              <p className="text-xs text-zinc-500">Einsätze Kälte 🥶</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{weatherGames.cold}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-3">
              <p className="text-xs text-zinc-500">Einsätze Schönwetter 🌤️</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{weatherGames.sunny}</p>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-stone-50 p-3">
              <p className="text-xs text-zinc-500">Einsätze Schlechtwetter 🌧️🥶</p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">{weatherGames.bad}</p>
            </article>
          </div>

          {weatherSummary ? (
            <p className="mt-4 rounded-xl border border-zinc-300 bg-stone-50 px-3 py-2 text-sm text-zinc-600">
              {weatherSummary}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Letzte Spiele</h2>
          {recentMatches.length === 0 ? (
            <p className="text-zinc-500">Noch keine Spiele für diesen Spieler erfasst.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentMatches.map((match) => (
                <li key={match.id} className="rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2">
                  {match.matchDate.toLocaleDateString("de-DE")} – {match.team1Name} vs {match.team2Name}{" "}
                  <Link href={`/admin/matches/${match.id}`} className="ml-2 text-red-300 hover:text-red-200">
                    Zum Match
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}