import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  legacyPlayerCareerStats,
  matchParticipants,
  players,
} from "@/src/db/schema";

type LegacyPlayerRow = {
  id: string;
  playerName: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
};

type ModernPlayerRow = {
  playerId: number;
  playerName: string;
  games: number;
  goals: number;
  assists: number;
};

async function getModernPlayerStats(): Promise<ModernPlayerRow[]> {
  const [allPlayers, gamesByPlayer, goalsByPlayer, assistsByPlayer] = await Promise.all([
    db
      .select({
        playerId: players.id,
        playerName: players.name,
      })
      .from(players)
      .orderBy(asc(players.name)),

    db
      .select({
        playerId: players.id,
        games: sql<number>`count(${matchParticipants.id})`,
      })
      .from(matchParticipants)
      .innerJoin(players, eq(matchParticipants.playerId, players.id))
      .groupBy(players.id),

    db
      .select({
        playerId: players.id,
        goals: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
      .where(eq(goalEvents.isOwnGoal, false))
      .groupBy(players.id),

    db
      .select({
        playerId: players.id,
        assists: sql<number>`count(${goalEvents.id})`,
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
      .where(and(eq(goalEvents.isOwnGoal, false)))
      .groupBy(players.id),
  ]);

  const statsByPlayer = new Map<number, ModernPlayerRow>();

  for (const player of allPlayers) {
    statsByPlayer.set(player.playerId, {
      playerId: player.playerId,
      playerName: player.playerName,
      games: 0,
      goals: 0,
      assists: 0,
    });
  }

  for (const row of gamesByPlayer) {
    const existing = statsByPlayer.get(row.playerId);
    if (existing) {
      existing.games = Number(row.games) || 0;
    }
  }

  for (const row of goalsByPlayer) {
    const existing = statsByPlayer.get(row.playerId);
    if (existing) {
      existing.goals = Number(row.goals) || 0;
    }
  }

  for (const row of assistsByPlayer) {
    const existing = statsByPlayer.get(row.playerId);
    if (existing) {
      existing.assists = Number(row.assists) || 0;
    }
  }

  return Array.from(statsByPlayer.values());
}

export default async function PlayerStatsPage() {
  const [legacyStats, modernStats]: [LegacyPlayerRow[], ModernPlayerRow[]] = await Promise.all([
    db
      .select({
        id: legacyPlayerCareerStats.id,
        playerName: legacyPlayerCareerStats.playerName,
        games: legacyPlayerCareerStats.games,
        goals: legacyPlayerCareerStats.goals,
        assists: legacyPlayerCareerStats.assists,
        points: legacyPlayerCareerStats.points,
      })
      .from(legacyPlayerCareerStats)
      .orderBy(asc(legacyPlayerCareerStats.playerName)),
    getModernPlayerStats(),
  ]);

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold">Spielerstatistiken</h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <h2 className="text-lg font-semibold text-zinc-900">Legacy-Statistiken</h2>

            {legacyStats.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Keine Legacy-Spielerstatistiken vorhanden.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-300 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-100 text-zinc-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Spieler</th>
                      <th className="px-3 py-2 text-left">Einsätze</th>
                      <th className="px-3 py-2 text-left">Tore</th>
                      <th className="px-3 py-2 text-left">Vorlagen</th>
                      <th className="px-3 py-2 text-left">Punkte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legacyStats.map((player) => (
                      <tr key={player.id} className="border-t border-zinc-300">
                        <td className="px-3 py-2 text-zinc-900">{player.playerName}</td>
                        <td className="px-3 py-2">{player.games}</td>
                        <td className="px-3 py-2">{player.goals}</td>
                        <td className="px-3 py-2">{player.assists}</td>
                        <td className="px-3 py-2 font-medium text-zinc-900">{player.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <h2 className="text-lg font-semibold text-zinc-900">Moderne Statistiken</h2>

            {modernStats.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Keine modernen Spielerstatistiken vorhanden.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-300 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-100 text-zinc-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Spieler</th>
                      <th className="px-3 py-2 text-left">Spiele</th>
                      <th className="px-3 py-2 text-left">Tore</th>
                      <th className="px-3 py-2 text-left">Vorlagen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modernStats.map((player) => (
                      <tr key={player.playerId} className="border-t border-zinc-300">
                        <td className="px-3 py-2 text-zinc-900">{player.playerName}</td>
                        <td className="px-3 py-2">{player.games}</td>
                        <td className="px-3 py-2">{player.goals}</td>
                        <td className="px-3 py-2">{player.assists}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}