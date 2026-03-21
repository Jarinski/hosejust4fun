"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, matchWeather } from "@/src/db/schema";
import { requireAdminInAction } from "@/src/lib/auth";

export async function updateMatchMVP(matchId: number, playerId: number | null) {
  await requireAdminInAction();

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

export async function deleteMatchById(matchId: number) {
  await requireAdminInAction();

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

  await db.transaction(async (tx) => {
    await tx.delete(goalEvents).where(eq(goalEvents.matchId, matchId));
    await tx.delete(matchParticipants).where(eq(matchParticipants.matchId, matchId));
    await tx.delete(matchWeather).where(eq(matchWeather.matchId, matchId));
    await tx.delete(matches).where(eq(matches.id, matchId));
  });
}
