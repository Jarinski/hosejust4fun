import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, players } from "@/src/db/schema";

type GuestPlayerRow = {
  playerId: number;
  playerName: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
};

async function getGuestPlayerStats(): Promise<GuestPlayerRow[]> {
  const [allPlayers, gamesByPlayer, goalsByPlayer, assistsByPlayer] = await (async () => {
    try {
      return await Promise.all([
        db
          .select({
            playerId: players.id,
            playerName: players.name,
          })
          .from(players)
          .where(eq(players.isGuest, true))
          .orderBy(asc(players.name)),
        db
          .select({
            playerId: players.id,
            games: sql<number>`count(${matchParticipants.id})`,
          })
          .from(matchParticipants)
          .innerJoin(players, eq(matchParticipants.playerId, players.id))
          .where(eq(players.isGuest, true))
          .groupBy(players.id),
        db
          .select({
            playerId: players.id,
            goals: sql<number>`count(${goalEvents.id})`,
          })
          .from(goalEvents)
          .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
          .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, true)))
          .groupBy(players.id),
        db
          .select({
            playerId: players.id,
            assists: sql<number>`count(${goalEvents.id})`,
          })
          .from(goalEvents)
          .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
          .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, true)))
          .groupBy(players.id),
      ]);
    } catch {
      return [[], [], [], []] as const;
    }
  })();

  const statsByPlayer = new Map<number, GuestPlayerRow>();

  for (const player of allPlayers) {
    statsByPlayer.set(player.playerId, {
      playerId: player.playerId,
      playerName: player.playerName,
      games: 0,
      goals: 0,
      assists: 0,
      points: 0,
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

  return Array.from(statsByPlayer.values())
    .map((player) => ({
      ...player,
      points: player.goals + player.assists,
    }))
    .sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName, "de"));
}

export default async function GuestPlayerStatsPage() {
  const guestStats = await getGuestPlayerStats();

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/stats" className="hover:text-zinc-900">
            ← Zurück zu Statistiken
          </Link>
        </p>

        <h1 className="text-2xl font-semibold">Gastspieler-Statistiken</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Eigene Statistikseite nur für Gastspieler (inkl. Tore, Assists, Punkte und Einsätze).
        </p>

        {guestStats.length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500">Noch keine Gastspieler mit erfassten Daten vorhanden.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-300 bg-stone-50">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-100 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left">Gastspieler</th>
                  <th className="px-3 py-2 text-left">Einsätze</th>
                  <th className="px-3 py-2 text-left">Tore</th>
                  <th className="px-3 py-2 text-left">Assists</th>
                  <th className="px-3 py-2 text-left">Punkte</th>
                </tr>
              </thead>
              <tbody>
                {guestStats.map((player) => (
                  <tr key={player.playerId} className="border-t border-zinc-300 bg-white">
                    <td className="px-3 py-2 font-medium text-zinc-900">
                      <Link href={`/admin/players/${player.playerId}`} className="hover:underline">
                        {player.playerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{player.games}</td>
                    <td className="px-3 py-2">{player.goals}</td>
                    <td className="px-3 py-2">{player.assists}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-900">{player.points}</td>
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