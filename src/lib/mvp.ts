import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches } from "@/src/db/schema";

type TeamSide = "team_1" | "team_2";

type PlayerStats = {
  scorerPoints: number;
  goals: number;
};

export async function recalculateMatchMvp(matchId: number) {
  if (!Number.isInteger(matchId)) {
    throw new Error("Ungültige Match-ID");
  }

  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (matchRows.length === 0) {
    throw new Error("Spiel nicht gefunden");
  }

  const [participantRows, goalRows] = await Promise.all([
    db
      .select({
        playerId: matchParticipants.playerId,
        teamSide: matchParticipants.teamSide,
      })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId)),
    db
      .select({
        teamSide: goalEvents.teamSide,
        isOwnGoal: goalEvents.isOwnGoal,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
      })
      .from(goalEvents)
      .where(eq(goalEvents.matchId, matchId)),
  ]);

  if (goalRows.length === 0) {
    await db.update(matches).set({ mvpPlayerId: null }).where(eq(matches.id, matchId));
    return;
  }

  const statsByPlayer = new Map<number, PlayerStats>();

  for (const goal of goalRows) {
    if (!goal.isOwnGoal) {
      const scorerStats = statsByPlayer.get(goal.scorerPlayerId) ?? { scorerPoints: 0, goals: 0 };
      scorerStats.scorerPoints += 1;
      scorerStats.goals += 1;
      statsByPlayer.set(goal.scorerPlayerId, scorerStats);
    }

    if (!goal.isOwnGoal && goal.assistPlayerId !== null) {
      const assistStats = statsByPlayer.get(goal.assistPlayerId) ?? { scorerPoints: 0, goals: 0 };
      assistStats.scorerPoints += 1;
      statsByPlayer.set(goal.assistPlayerId, assistStats);
    }
  }

  const scoredPlayers = [...statsByPlayer.entries()];
  if (scoredPlayers.length === 0) {
    await db.update(matches).set({ mvpPlayerId: null }).where(eq(matches.id, matchId));
    return;
  }

  const maxScorerPoints = Math.max(...scoredPlayers.map(([, stats]) => stats.scorerPoints));
  let candidates = scoredPlayers
    .filter(([, stats]) => stats.scorerPoints === maxScorerPoints)
    .map(([playerId]) => playerId);

  if (candidates.length > 1) {
    const maxGoals = Math.max(...candidates.map((playerId) => statsByPlayer.get(playerId)?.goals ?? 0));
    candidates = candidates.filter((playerId) => (statsByPlayer.get(playerId)?.goals ?? 0) === maxGoals);
  }

  if (candidates.length > 1) {
    const team1Goals = goalRows.filter((goal) => goal.teamSide === "team_1").length;
    const team2Goals = goalRows.filter((goal) => goal.teamSide === "team_2").length;
    const winnerSide: TeamSide | null =
      team1Goals > team2Goals ? "team_1" : team2Goals > team1Goals ? "team_2" : null;

    if (winnerSide) {
      const participantTeamByPlayerId = new Map(participantRows.map((row) => [row.playerId, row.teamSide]));
      const winnerCandidates = candidates.filter(
        (playerId) => participantTeamByPlayerId.get(playerId) === winnerSide
      );

      if (winnerCandidates.length > 0) {
        candidates = winnerCandidates;
      }
    }
  }

  const [mvpPlayerId] = candidates.sort((a, b) => a - b);

  await db
    .update(matches)
    .set({ mvpPlayerId: mvpPlayerId ?? null })
    .where(eq(matches.id, matchId));
}
