import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, playerBadges } from "@/src/db/schema";
import { BADGE_KEYS, type BadgeKey } from "@/src/lib/badges";

type TeamSide = "team_1" | "team_2";
type MatchResult = "win" | "draw" | "loss";

type SeasonMatchRow = {
  id: number;
  team1Score: number;
  team2Score: number;
};

type ParticipantRow = {
  matchId: number;
  playerId: number;
  teamSide: TeamSide;
};

const SEASON_WIDE_STREAK_BADGE_KEYS: BadgeKey[] = [
  BADGE_KEYS.DRAW_MATCH,
  BADGE_KEYS.DRAW_STREAK_2,
  BADGE_KEYS.WIN_STREAK_3,
  BADGE_KEYS.WIN_STREAK_5,
  BADGE_KEYS.WIN_STREAK_10,
  BADGE_KEYS.LOSS_STREAK_3,
  BADGE_KEYS.LOSS_STREAK_5,
  BADGE_KEYS.LOSS_STREAK_10,
  BADGE_KEYS.CLEAN_SHEET_STREAK_2,
  BADGE_KEYS.CLEAN_SHEET_STREAK_3,
  BADGE_KEYS.ASSIST_STREAK_3,
  BADGE_KEYS.ASSIST_STREAK_5,
  BADGE_KEYS.ASSIST_STREAK_10,
  BADGE_KEYS.APPEARANCE_STREAK_3,
  BADGE_KEYS.APPEARANCE_STREAK_5,
  BADGE_KEYS.APPEARANCE_STREAK_10,
  BADGE_KEYS.APPEARANCE_STREAK_20,
];

function getResultForParticipant(match: SeasonMatchRow, teamSide: TeamSide): MatchResult {
  if (match.team1Score === match.team2Score) {
    return "draw";
  }

  if (teamSide === "team_1") {
    return match.team1Score > match.team2Score ? "win" : "loss";
  }

  return match.team2Score > match.team1Score ? "win" : "loss";
}

function hasCleanSheet(match: SeasonMatchRow, teamSide: TeamSide) {
  const concededGoals = teamSide === "team_1" ? match.team2Score : match.team1Score;
  return concededGoals === 0;
}

export async function recomputeSeasonStreakBadges(seasonId: number) {
  if (!Number.isInteger(seasonId)) {
    throw new Error("Ungültige Saison-ID");
  }

  await db
    .delete(playerBadges)
    .where(
      and(
        eq(playerBadges.seasonId, seasonId),
        inArray(playerBadges.badgeKey, SEASON_WIDE_STREAK_BADGE_KEYS)
      )
    );

  const matchRows = await db
    .select({
      id: matches.id,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
    })
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.matchDate), asc(matches.id));

  if (matchRows.length === 0) {
    return;
  }

  const matchIds = matchRows.map((match) => match.id);

  const participantRows = await db
    .select({
      matchId: matchParticipants.matchId,
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
    })
    .from(matchParticipants)
    .where(inArray(matchParticipants.matchId, matchIds));

  const participantsByMatch = new Map<number, ParticipantRow[]>();

  for (const participant of participantRows) {
    const existingParticipants = participantsByMatch.get(participant.matchId);

    if (existingParticipants) {
      existingParticipants.push(participant);
      continue;
    }

    participantsByMatch.set(participant.matchId, [participant]);
  }

  const assistRows = await db
    .select({
      matchId: goalEvents.matchId,
      assistPlayerId: goalEvents.assistPlayerId,
    })
    .from(goalEvents)
    .where(inArray(goalEvents.matchId, matchIds));

  const assistPlayersByMatch = new Map<number, Set<number>>();

  for (const assistRow of assistRows) {
    if (assistRow.assistPlayerId === null) {
      continue;
    }

    const existingAssistPlayers = assistPlayersByMatch.get(assistRow.matchId);

    if (existingAssistPlayers) {
      existingAssistPlayers.add(assistRow.assistPlayerId);
      continue;
    }

    assistPlayersByMatch.set(assistRow.matchId, new Set([assistRow.assistPlayerId]));
  }

  const playerIdsInSeason = new Set<number>();

  for (const participant of participantRows) {
    playerIdsInSeason.add(participant.playerId);
  }

  const playerSequences = new Map<
    number,
    Array<{ matchId: number; result: MatchResult; cleanSheet: boolean }>
  >();

  for (const match of matchRows) {
    const participants = participantsByMatch.get(match.id) ?? [];

    for (const participant of participants) {
      const playerSequence = playerSequences.get(participant.playerId);

      const sequenceItem = {
        matchId: match.id,
        result: getResultForParticipant(match, participant.teamSide),
        cleanSheet: hasCleanSheet(match, participant.teamSide),
      };

      if (playerSequence) {
        playerSequence.push(sequenceItem);
        continue;
      }

      playerSequences.set(participant.playerId, [sequenceItem]);
    }
  }

  const badgesToInsert: Array<{
    playerId: number;
    seasonId: number;
    badgeKey: BadgeKey;
    matchId: number;
    goalEventId: null;
  }> = [];

  for (const [playerId, sequence] of playerSequences.entries()) {
    let winStreak = 0;
    let drawStreak = 0;
    let lossStreak = 0;
    let cleanSheetStreak = 0;

    const unlockedBadges = new Map<BadgeKey, number>();

    for (const entry of sequence) {
      if (entry.result === "win") {
        winStreak += 1;
        drawStreak = 0;
        lossStreak = 0;
      } else if (entry.result === "draw") {
        drawStreak += 1;
        winStreak = 0;
        lossStreak = 0;

        if (!unlockedBadges.has(BADGE_KEYS.DRAW_MATCH)) {
          unlockedBadges.set(BADGE_KEYS.DRAW_MATCH, entry.matchId);
        }
      } else {
        lossStreak += 1;
        winStreak = 0;
        drawStreak = 0;
      }

      if (entry.cleanSheet) {
        cleanSheetStreak += 1;
      } else {
        cleanSheetStreak = 0;
      }

      if (drawStreak >= 2 && !unlockedBadges.has(BADGE_KEYS.DRAW_STREAK_2)) {
        unlockedBadges.set(BADGE_KEYS.DRAW_STREAK_2, entry.matchId);
      }

      if (winStreak >= 3 && !unlockedBadges.has(BADGE_KEYS.WIN_STREAK_3)) {
        unlockedBadges.set(BADGE_KEYS.WIN_STREAK_3, entry.matchId);
      }

      if (winStreak >= 5 && !unlockedBadges.has(BADGE_KEYS.WIN_STREAK_5)) {
        unlockedBadges.set(BADGE_KEYS.WIN_STREAK_5, entry.matchId);
      }

      if (winStreak >= 10 && !unlockedBadges.has(BADGE_KEYS.WIN_STREAK_10)) {
        unlockedBadges.set(BADGE_KEYS.WIN_STREAK_10, entry.matchId);
      }

      if (lossStreak >= 3 && !unlockedBadges.has(BADGE_KEYS.LOSS_STREAK_3)) {
        unlockedBadges.set(BADGE_KEYS.LOSS_STREAK_3, entry.matchId);
      }

      if (lossStreak >= 5 && !unlockedBadges.has(BADGE_KEYS.LOSS_STREAK_5)) {
        unlockedBadges.set(BADGE_KEYS.LOSS_STREAK_5, entry.matchId);
      }

      if (lossStreak >= 10 && !unlockedBadges.has(BADGE_KEYS.LOSS_STREAK_10)) {
        unlockedBadges.set(BADGE_KEYS.LOSS_STREAK_10, entry.matchId);
      }

      if (cleanSheetStreak >= 2 && !unlockedBadges.has(BADGE_KEYS.CLEAN_SHEET_STREAK_2)) {
        unlockedBadges.set(BADGE_KEYS.CLEAN_SHEET_STREAK_2, entry.matchId);
      }

      if (cleanSheetStreak >= 3 && !unlockedBadges.has(BADGE_KEYS.CLEAN_SHEET_STREAK_3)) {
        unlockedBadges.set(BADGE_KEYS.CLEAN_SHEET_STREAK_3, entry.matchId);
      }
    }

    for (const [badgeKey, matchId] of unlockedBadges.entries()) {
      badgesToInsert.push({
        playerId,
        seasonId,
        badgeKey,
        matchId,
        goalEventId: null,
      });
    }
  }

  for (const playerId of playerIdsInSeason) {
    let appearanceStreak = 0;
    let assistStreak = 0;

    const unlockedBadges = new Map<BadgeKey, number>();

    for (const match of matchRows) {
      const participants = participantsByMatch.get(match.id) ?? [];
      const participated = participants.some((participant) => participant.playerId === playerId);

      if (!participated) {
        appearanceStreak = 0;
        assistStreak = 0;
        continue;
      }

      appearanceStreak += 1;

      const assistPlayers = assistPlayersByMatch.get(match.id);
      const hasAssistInMatch = assistPlayers?.has(playerId) ?? false;

      if (hasAssistInMatch) {
        assistStreak += 1;
      } else {
        assistStreak = 0;
      }

      if (
        appearanceStreak >= 3 &&
        !unlockedBadges.has(BADGE_KEYS.APPEARANCE_STREAK_3)
      ) {
        unlockedBadges.set(BADGE_KEYS.APPEARANCE_STREAK_3, match.id);
      }

      if (
        appearanceStreak >= 5 &&
        !unlockedBadges.has(BADGE_KEYS.APPEARANCE_STREAK_5)
      ) {
        unlockedBadges.set(BADGE_KEYS.APPEARANCE_STREAK_5, match.id);
      }

      if (
        appearanceStreak >= 10 &&
        !unlockedBadges.has(BADGE_KEYS.APPEARANCE_STREAK_10)
      ) {
        unlockedBadges.set(BADGE_KEYS.APPEARANCE_STREAK_10, match.id);
      }

      if (
        appearanceStreak >= 20 &&
        !unlockedBadges.has(BADGE_KEYS.APPEARANCE_STREAK_20)
      ) {
        unlockedBadges.set(BADGE_KEYS.APPEARANCE_STREAK_20, match.id);
      }

      if (assistStreak >= 3 && !unlockedBadges.has(BADGE_KEYS.ASSIST_STREAK_3)) {
        unlockedBadges.set(BADGE_KEYS.ASSIST_STREAK_3, match.id);
      }

      if (assistStreak >= 5 && !unlockedBadges.has(BADGE_KEYS.ASSIST_STREAK_5)) {
        unlockedBadges.set(BADGE_KEYS.ASSIST_STREAK_5, match.id);
      }

      if (assistStreak >= 10 && !unlockedBadges.has(BADGE_KEYS.ASSIST_STREAK_10)) {
        unlockedBadges.set(BADGE_KEYS.ASSIST_STREAK_10, match.id);
      }
    }

    for (const [badgeKey, matchId] of unlockedBadges.entries()) {
      badgesToInsert.push({
        playerId,
        seasonId,
        badgeKey,
        matchId,
        goalEventId: null,
      });
    }
  }

  if (badgesToInsert.length === 0) {
    return;
  }

  await db
    .insert(playerBadges)
    .values(badgesToInsert)
    .onConflictDoNothing({
      target: [playerBadges.playerId, playerBadges.seasonId, playerBadges.badgeKey],
    });
}