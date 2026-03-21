"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { matchParticipants, matches } from "@/src/db/schema";

export async function updateMatchMVP(matchId: number, playerId: number | null) {
  if (!Number.isInteger(matchId)) {
    throw new Error("Ungültige Match-ID");
  }

  const existingMatch = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (existingMatch.length === 0) {
    throw new Error("Spiel nicht gefunden");
  }

  if (playerId !== null) {
    if (!Number.isInteger(playerId)) {
      throw new Error("Ungültige Spieler-ID");
    }

    const participant = await db
      .select({ id: matchParticipants.id })
      .from(matchParticipants)
      .where(
        and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.playerId, playerId))
      )
      .limit(1);

    if (participant.length === 0) {
      throw new Error("Spieler ist kein Teilnehmer dieses Matches");
    }
  }

  await db
    .update(matches)
    .set({ mvpPlayerId: playerId })
    .where(eq(matches.id, matchId));
}
