import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, matchWeather, playerBadges } from "@/src/db/schema";
import { BADGE_KEYS, type BadgeKey } from "@/src/lib/badges";

type TeamSide = "team_1" | "team_2";

type GoalEventRow = {
  id: number;
  teamSide: TeamSide;
  isOwnGoal: boolean;
  scorerPlayerId: number;
  assistPlayerId: number | null;
  minute: number | null;
  goalType: string | null;
  createdAt: Date | null;
};

type PendingBadgeInsert = {
  playerId: number;
  seasonId: number;
  badgeKey: BadgeKey;
  matchId: number;
  goalEventId: number | null;
};

type MatchWeatherSnapshot = {
  conditionLabel: string | null;
  precipMm: number | null;
  temperatureC: number | null;
};

type MatchWeatherFlags = {
  hasAnyReliableData: boolean;
  isRain: boolean;
  isSunshine: boolean;
  isCloudy: boolean;
  isHeat: boolean;
  isCold: boolean;
};

const COLD_DEFAULT_THRESHOLD_C = 10;

const CLEAR_SKY_REGEX = /\b(klar|clear\s*sky|clear)\b/i;
const CLOUDY_REGEX = /\b(bew[öo]lkt|wolkig|cloud(y|s)?|overcast)\b/i;

function normalizeConditionLabel(value: string | null) {
  return (value ?? "").trim();
}

function getMatchWeatherFlags(weather: MatchWeatherSnapshot | null): MatchWeatherFlags {
  if (!weather) {
    return {
      hasAnyReliableData: false,
      isRain: false,
      isSunshine: false,
      isCloudy: false,
      isHeat: false,
      isCold: false,
    };
  }

  const conditionLabel = normalizeConditionLabel(weather.conditionLabel);
  const hasConditionLabel = conditionLabel.length > 0;
  const precipMm = weather.precipMm;
  const temperatureC = weather.temperatureC;
  const hasPrecip = precipMm !== null;
  const hasTemperature = temperatureC !== null;

  const isRain = hasPrecip && precipMm > 0;

  // Sunshine bewusst streng: nur klarer Himmel, ohne Wolken-Signal.
  const hasClearSkySignal = hasConditionLabel && CLEAR_SKY_REGEX.test(conditionLabel);
  const hasCloudSignal = hasConditionLabel && CLOUDY_REGEX.test(conditionLabel);
  // Regen hat immer Priorität: bei Regen keine Sunshine/Cloudy-Badges.
  const isSunshine = hasClearSkySignal && !hasCloudSignal && !isRain;
  const isCloudy = hasCloudSignal && !hasClearSkySignal && !isRain;

  const isHeat = hasTemperature && temperatureC > 30;
  const isCold = hasTemperature && temperatureC < COLD_DEFAULT_THRESHOLD_C;

  return {
    hasAnyReliableData: hasConditionLabel || hasPrecip || hasTemperature,
    isRain,
    isSunshine,
    isCloudy,
    isHeat,
    isCold,
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybePgError = error as { code?: string; message?: string };

  if (maybePgError.code === "42703") {
    return true;
  }

  return typeof maybePgError.message === "string" && maybePgError.message.includes(columnName);
}

function getOppositeTeamSide(teamSide: TeamSide): TeamSide {
  return teamSide === "team_1" ? "team_2" : "team_1";
}

function incrementCounter(counter: Map<number, number>, playerId: number) {
  counter.set(playerId, (counter.get(playerId) ?? 0) + 1);
}

function getAssistToScorerPairKey(assistPlayerId: number, scorerPlayerId: number) {
  return `${assistPlayerId}->${scorerPlayerId}`;
}

function addTeamBadgeForParticipants(
  pendingBadges: PendingBadgeInsert[],
  participants: Array<{ playerId: number; teamSide: TeamSide }>,
  teamSide: TeamSide,
  seasonId: number,
  badgeKey: BadgeKey,
  matchId: number
) {
  for (const participant of participants) {
    if (participant.teamSide !== teamSide) {
      continue;
    }

    pendingBadges.push({
      playerId: participant.playerId,
      seasonId,
      badgeKey,
      matchId,
      goalEventId: null,
    });
  }
}

export async function awardSimpleBadgesForMatch(matchId: number) {
  if (!Number.isInteger(matchId)) {
    throw new Error("Ungültige Match-ID");
  }

  const matchRows = await db
    .select({ id: matches.id, seasonId: matches.seasonId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  const match = matchRows[0];
  if (!match) {
    throw new Error("Spiel nicht gefunden");
  }

  const weatherRows = await db
    .select({
      conditionLabel: matchWeather.conditionLabel,
      precipMm: matchWeather.precipMm,
      temperatureC: matchWeather.temperatureC,
    })
    .from(matchWeather)
    .where(eq(matchWeather.matchId, matchId))
    .limit(1);

  const weatherFlags = getMatchWeatherFlags(weatherRows[0] ?? null);

  let goalRows: GoalEventRow[] = [];

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

    const legacyGoalRows = await db
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

    goalRows = legacyGoalRows.map((goal) => ({
      ...goal,
      isOwnGoal: false,
    }));
  }

  const participantRows = await db
    .select({
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
    })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  const sortedGoalRows = [...goalRows].sort((a, b) => {
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

  type GoalScoreState = {
    goal: GoalEventRow;
    team1Before: number;
    team2Before: number;
    team1After: number;
    team2After: number;
  };

  const scoreStates: GoalScoreState[] = [];
  let team1ScoreRunning = 0;
  let team2ScoreRunning = 0;

  for (const goal of sortedGoalRows) {
    const team1Before = team1ScoreRunning;
    const team2Before = team2ScoreRunning;

    if (goal.teamSide === "team_1") {
      team1ScoreRunning += 1;
    } else {
      team2ScoreRunning += 1;
    }

    scoreStates.push({
      goal,
      team1Before,
      team2Before,
      team1After: team1ScoreRunning,
      team2After: team2ScoreRunning,
    });
  }

  const team1FinalScore = team1ScoreRunning;
  const team2FinalScore = team2ScoreRunning;

  const winningSide: TeamSide | null =
    team1FinalScore === team2FinalScore
      ? null
      : team1FinalScore > team2FinalScore
        ? "team_1"
        : "team_2";

  const losingSide: TeamSide | null = winningSide ? getOppositeTeamSide(winningSide) : null;
  const finalMargin = Math.abs(team1FinalScore - team2FinalScore);

  const losingSideFinalGoals =
    losingSide === "team_1" ? team1FinalScore : losingSide === "team_2" ? team2FinalScore : 0;

  let consolationGoalEventId: number | null = null;

  if (losingSide !== null && losingSideFinalGoals > 0) {
    for (const state of scoreStates) {
      const scoringTeamAfter =
        losingSide === "team_1" ? state.team1After : state.team2After;

      if (
        !state.goal.isOwnGoal &&
        state.goal.teamSide === losingSide &&
        scoringTeamAfter === losingSideFinalGoals
      ) {
        consolationGoalEventId = state.goal.id;
        break;
      }
    }
  }

  const goalCountByPlayer = new Map<number, number>();
  const assistCountByPlayer = new Map<number, number>();
  const assistToScorerPairs = new Set<string>();
  const pendingBadges: PendingBadgeInsert[] = [];

  let winningGoalEventId: number | null = null;

  if (winningSide) {
    const signedDiffAfter = scoreStates.map(({ team1After, team2After }) =>
      winningSide === "team_1" ? team1After - team2After : team2After - team1After
    );

    let minSuffix = Number.POSITIVE_INFINITY;

    for (let i = signedDiffAfter.length - 1; i >= 0; i -= 1) {
      minSuffix = Math.min(minSuffix, signedDiffAfter[i]);

      const isWinnerGoal = scoreStates[i].goal.teamSide === winningSide;
      const winnerLeadingAfterGoal = signedDiffAfter[i] > 0;
      const winnerNeverFallsBackToDrawOrBehind = minSuffix > 0;

      if (isWinnerGoal && winnerLeadingAfterGoal && winnerNeverFallsBackToDrawOrBehind) {
        winningGoalEventId = scoreStates[i].goal.id;
      }
    }
  }

  let team1WasTrailing = false;
  let team2WasTrailing = false;

  for (const state of scoreStates) {
    const goal = state.goal;

    if (state.team1Before < state.team2Before) {
      team1WasTrailing = true;
    }

    if (state.team2Before < state.team1Before) {
      team2WasTrailing = true;
    }

    incrementCounter(goalCountByPlayer, goal.scorerPlayerId);

    if (goal.minute !== null && goal.minute <= 15) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.FIRST_15_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    // LAST_15_GOAL wird in diesem Schritt bewusst nicht vergeben,
    // da im Projekt aktuell keine stabile Matchlängen-Definition hinterlegt ist.

    if (goal.minute !== null && goal.minute >= 89) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.LAST_MINUTE_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (goal.minute === 1) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.FAST_START_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (weatherFlags.hasAnyReliableData) {
      if (weatherFlags.isRain) {
        pendingBadges.push({
          playerId: goal.scorerPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.RAIN_GOAL,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (weatherFlags.isSunshine) {
        pendingBadges.push({
          playerId: goal.scorerPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.SUNSHINE_GOAL,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (weatherFlags.isCloudy) {
        pendingBadges.push({
          playerId: goal.scorerPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.CLOUDY_GOAL,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (weatherFlags.isHeat) {
        pendingBadges.push({
          playerId: goal.scorerPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.HEAT_GOAL,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (weatherFlags.isCold) {
        pendingBadges.push({
          playerId: goal.scorerPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.COLD_GOAL,
          matchId,
          goalEventId: goal.id,
        });
      }
    }

    if (goal.goalType === "longshot") {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.LONGSHOT_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (goal.goalType === "corner") {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.CORNER_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (goal.goalType === "rebound") {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.REBOUND_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    const scoringTeamBefore = goal.teamSide === "team_1" ? state.team1Before : state.team2Before;
    const concedingTeamBefore = goal.teamSide === "team_1" ? state.team2Before : state.team1Before;
    const scoringTeamAfter = goal.teamSide === "team_1" ? state.team1After : state.team2After;
    const concedingTeamAfter = goal.teamSide === "team_1" ? state.team2After : state.team1After;

    const isEqualizerGoal = scoringTeamAfter === concedingTeamAfter;
    const isComebackGoal = scoringTeamBefore < concedingTeamBefore;
    const isWinningGoal = winningGoalEventId !== null && goal.id === winningGoalEventId;
    const isConsolationGoal = consolationGoalEventId !== null && goal.id === consolationGoalEventId;

    if (!goal.isOwnGoal && isEqualizerGoal) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.EQUALIZER_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (!goal.isOwnGoal && isComebackGoal) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.COMEBACK_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (!goal.isOwnGoal && isWinningGoal) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.WINNING_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (isConsolationGoal) {
      pendingBadges.push({
        playerId: goal.scorerPlayerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.CONSOLATION_GOAL,
        matchId,
        goalEventId: goal.id,
      });
    }

    if (goal.assistPlayerId !== null) {
      incrementCounter(assistCountByPlayer, goal.assistPlayerId);

      if (!goal.isOwnGoal && goal.assistPlayerId !== goal.scorerPlayerId) {
        assistToScorerPairs.add(getAssistToScorerPairKey(goal.assistPlayerId, goal.scorerPlayerId));
      }

      if (goal.minute !== null && goal.minute <= 15) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.FIRST_15_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      // LAST_15_ASSIST wird in diesem Schritt bewusst nicht vergeben,
      // da im Projekt aktuell keine stabile Matchlängen-Definition hinterlegt ist.

      if (goal.minute !== null && goal.minute >= 89) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.LAST_MINUTE_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (goal.minute === 1) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.FAST_START_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (goal.goalType === "corner") {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.CORNER_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (weatherFlags.hasAnyReliableData) {
        if (weatherFlags.isRain) {
          pendingBadges.push({
            playerId: goal.assistPlayerId,
            seasonId: match.seasonId,
            badgeKey: BADGE_KEYS.RAIN_ASSIST,
            matchId,
            goalEventId: goal.id,
          });
        }

        if (weatherFlags.isSunshine) {
          pendingBadges.push({
            playerId: goal.assistPlayerId,
            seasonId: match.seasonId,
            badgeKey: BADGE_KEYS.SUNSHINE_ASSIST,
            matchId,
            goalEventId: goal.id,
          });
        }

        if (weatherFlags.isCloudy) {
          pendingBadges.push({
            playerId: goal.assistPlayerId,
            seasonId: match.seasonId,
            badgeKey: BADGE_KEYS.CLOUDY_ASSIST,
            matchId,
            goalEventId: goal.id,
          });
        }

        if (weatherFlags.isHeat) {
          pendingBadges.push({
            playerId: goal.assistPlayerId,
            seasonId: match.seasonId,
            badgeKey: BADGE_KEYS.HEAT_ASSIST,
            matchId,
            goalEventId: goal.id,
          });
        }

        if (weatherFlags.isCold) {
          pendingBadges.push({
            playerId: goal.assistPlayerId,
            seasonId: match.seasonId,
            badgeKey: BADGE_KEYS.COLD_ASSIST,
            matchId,
            goalEventId: goal.id,
          });
        }
      }

      if (isEqualizerGoal) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.EQUALIZER_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (isComebackGoal) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.COMEBACK_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (isWinningGoal) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.WINNING_GOAL_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }

      if (isConsolationGoal) {
        pendingBadges.push({
          playerId: goal.assistPlayerId,
          seasonId: match.seasonId,
          badgeKey: BADGE_KEYS.CONSOLATION_ASSIST,
          matchId,
          goalEventId: goal.id,
        });
      }
    }
  }

  const winnerWasTrailingAtLeastOnce =
    winningSide === "team_1" ? team1WasTrailing : winningSide === "team_2" ? team2WasTrailing : false;

  if (winningSide !== null && winnerWasTrailingAtLeastOnce) {
    for (const participant of participantRows) {
      if (participant.teamSide !== winningSide) {
        continue;
      }

      pendingBadges.push({
        playerId: participant.playerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.COMEBACK_WIN,
        matchId,
        goalEventId: null,
      });
    }
  }

  const defenseStates: Record<
    TeamSide,
    {
      concededTotal: number;
      concededInFirstHalf: boolean;
      concededInSecondHalf: boolean;
      concededInFirst15: boolean;
      concededFrom89: boolean;
      isWinner: boolean;
      margin: number;
    }
  > = {
    team_1: {
      concededTotal: 0,
      concededInFirstHalf: false,
      concededInSecondHalf: false,
      concededInFirst15: false,
      concededFrom89: false,
      isWinner: winningSide === "team_1",
      margin: winningSide === "team_1" ? finalMargin : 0,
    },
    team_2: {
      concededTotal: 0,
      concededInFirstHalf: false,
      concededInSecondHalf: false,
      concededInFirst15: false,
      concededFrom89: false,
      isWinner: winningSide === "team_2",
      margin: winningSide === "team_2" ? finalMargin : 0,
    },
  };

  for (const goal of goalRows) {
    const concededSide = getOppositeTeamSide(goal.teamSide);
    const defenseState = defenseStates[concededSide];

    defenseState.concededTotal += 1;

    if (goal.minute !== null && goal.minute <= 45) {
      defenseState.concededInFirstHalf = true;
    }

    if (goal.minute !== null && goal.minute > 45) {
      defenseState.concededInSecondHalf = true;
    }

    if (goal.minute !== null && goal.minute <= 15) {
      defenseState.concededInFirst15 = true;
    }

    if (goal.minute !== null && goal.minute >= 89) {
      defenseState.concededFrom89 = true;
    }
  }

  (Object.keys(defenseStates) as TeamSide[]).forEach((teamSide) => {
    const defenseState = defenseStates[teamSide];

    if (defenseState.concededTotal === 0) {
      addTeamBadgeForParticipants(
        pendingBadges,
        participantRows,
        teamSide,
        match.seasonId,
        BADGE_KEYS.CLEAN_SHEET,
        matchId
      );

      if (defenseState.isWinner && defenseState.margin >= 3) {
        addTeamBadgeForParticipants(
          pendingBadges,
          participantRows,
          teamSide,
          match.seasonId,
          BADGE_KEYS.CLEAN_SHEET_BIG_WIN,
          matchId
        );
      }

      if (defenseState.isWinner && defenseState.margin === 1) {
        addTeamBadgeForParticipants(
          pendingBadges,
          participantRows,
          teamSide,
          match.seasonId,
          BADGE_KEYS.CLEAN_SHEET_CLOSE_GAME,
          matchId
        );
      }

      if (weatherFlags.hasAnyReliableData) {
        if (weatherFlags.isRain) {
          addTeamBadgeForParticipants(
            pendingBadges,
            participantRows,
            teamSide,
            match.seasonId,
            BADGE_KEYS.RAIN_WALL,
            matchId
          );
        }

        if (weatherFlags.isHeat) {
          addTeamBadgeForParticipants(
            pendingBadges,
            participantRows,
            teamSide,
            match.seasonId,
            BADGE_KEYS.HEAT_WALL,
            matchId
          );
        }

        if (weatherFlags.isCold) {
          addTeamBadgeForParticipants(
            pendingBadges,
            participantRows,
            teamSide,
            match.seasonId,
            BADGE_KEYS.COLD_WALL,
            matchId
          );
        }
      }
    }

    if (!defenseState.concededInFirstHalf) {
      addTeamBadgeForParticipants(
        pendingBadges,
        participantRows,
        teamSide,
        match.seasonId,
        BADGE_KEYS.FIRST_HALF_CLEAN_SHEET,
        matchId
      );
    }

    if (!defenseState.concededInSecondHalf) {
      addTeamBadgeForParticipants(
        pendingBadges,
        participantRows,
        teamSide,
        match.seasonId,
        BADGE_KEYS.SECOND_HALF_CLEAN_SHEET,
        matchId
      );
    }

    if (!defenseState.concededInFirst15) {
      addTeamBadgeForParticipants(
        pendingBadges,
        participantRows,
        teamSide,
        match.seasonId,
        BADGE_KEYS.EARLY_WALL,
        matchId
      );
    }

    // LATE_WALL wird bewusst nicht vergeben,
    // da weiterhin keine stabile zentrale Matchlängen-Definition hinterlegt ist.

    if (!defenseState.concededFrom89) {
      addTeamBadgeForParticipants(
        pendingBadges,
        participantRows,
        teamSide,
        match.seasonId,
        BADGE_KEYS.LAST_MINUTE_DEFENSE,
        matchId
      );
    }
  });

  for (const [playerId, goalCount] of goalCountByPlayer.entries()) {
    if (goalCount >= 2) {
      pendingBadges.push({
        playerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.BRACE,
        matchId,
        goalEventId: null,
      });
    }

    if (goalCount >= 3) {
      pendingBadges.push({
        playerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.HATTRICK,
        matchId,
        goalEventId: null,
      });
    }
  }

  for (const [playerId, assistCount] of assistCountByPlayer.entries()) {
    if (assistCount >= 2) {
      pendingBadges.push({
        playerId,
        seasonId: match.seasonId,
        badgeKey: BADGE_KEYS.DOUBLE_ASSIST_MATCH,
        matchId,
        goalEventId: null,
      });
    }
  }

  const mutualAssistPlayers = new Set<number>();

  for (const pairKey of assistToScorerPairs) {
    const [assistPlayerIdRaw, scorerPlayerIdRaw] = pairKey.split("->");
    const inversePairKey = `${scorerPlayerIdRaw}->${assistPlayerIdRaw}`;

    if (!assistToScorerPairs.has(inversePairKey)) {
      continue;
    }

    mutualAssistPlayers.add(Number(assistPlayerIdRaw));
    mutualAssistPlayers.add(Number(scorerPlayerIdRaw));
  }

  for (const playerId of mutualAssistPlayers) {
    pendingBadges.push({
      playerId,
      seasonId: match.seasonId,
      badgeKey: BADGE_KEYS.MUTUAL_ASSIST_SAME_MATCH,
      matchId,
      goalEventId: null,
    });
  }

  await db.transaction(async (tx) => {
    await tx.delete(playerBadges).where(eq(playerBadges.matchId, matchId));

    if (pendingBadges.length === 0) {
      return;
    }

    await tx
      .insert(playerBadges)
      .values(pendingBadges)
      .onConflictDoNothing({
        target: [playerBadges.playerId, playerBadges.seasonId, playerBadges.badgeKey],
      });
  });
}