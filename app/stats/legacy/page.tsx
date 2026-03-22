import { asc, desc } from "drizzle-orm";
import { db } from "@/src/db";
import { legacyPlayerCareerStats } from "@/src/db/schema";

type LegacyStatPlayer = {
  id: string;
  playerName: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
};

type StatCategory = {
  title: string;
  players: LegacyStatPlayer[];
};

function StatList({ title, players }: StatCategory) {
  return (
    <section className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>

      {players.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Keine Daten vorhanden.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {players.map((player, index) => (
            <li
              key={player.id}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-zinc-900">
                  {index + 1}. {player.playerName}
                </p>
                <span className="text-xs text-zinc-500">{player.games} Einsätze</span>
              </div>
              <p className="mt-1 text-zinc-600">
                Tore: <span className="font-medium text-zinc-900">{player.goals}</span>
                {" · "}
                Vorlagen: <span className="font-medium text-zinc-900">{player.assists}</span>
                {" · "}
                Punkte: <span className="font-medium text-zinc-900">{player.points}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function LegacyStatsPage() {
  const [topGoals, topAssists, topPoints, allPlayers] = await Promise.all([
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
      .orderBy(desc(legacyPlayerCareerStats.goals), asc(legacyPlayerCareerStats.playerName))
      .limit(10),
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
      .orderBy(desc(legacyPlayerCareerStats.assists), asc(legacyPlayerCareerStats.playerName))
      .limit(10),
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
      .orderBy(desc(legacyPlayerCareerStats.points), asc(legacyPlayerCareerStats.playerName))
      .limit(10),
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
      .orderBy(desc(legacyPlayerCareerStats.points), asc(legacyPlayerCareerStats.playerName)),
  ]);

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold">All-Time Statistiken</h1>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatList title="Topscorer (Tore)" players={topGoals} />
          <StatList title="Assist-Könige" players={topAssists} />
          <StatList title="Scorerpunkte" players={topPoints} />
        </div>

        <section className="mt-6 rounded-xl border border-zinc-300 bg-stone-50 p-4">
          <h2 className="text-lg font-semibold text-zinc-900">Alle Spieler</h2>

          {allPlayers.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Keine Legacy-Spielerstatistiken vorhanden.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-300 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-100 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Spieler</th>
                    <th className="px-3 py-2 text-left">Tore</th>
                    <th className="px-3 py-2 text-left">Vorlagen</th>
                    <th className="px-3 py-2 text-left">Punkte</th>
                    <th className="px-3 py-2 text-left">Einsätze</th>
                  </tr>
                </thead>
                <tbody>
                  {allPlayers.map((player) => (
                    <tr key={player.id} className="border-t border-zinc-300">
                      <td className="px-3 py-2 text-zinc-900">{player.playerName}</td>
                      <td className="px-3 py-2">{player.goals}</td>
                      <td className="px-3 py-2">{player.assists}</td>
                      <td className="px-3 py-2 font-medium text-zinc-900">{player.points}</td>
                      <td className="px-3 py-2">{player.games}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}