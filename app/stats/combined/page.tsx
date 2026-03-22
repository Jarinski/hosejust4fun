import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  legacyPlayerCareerStats,
  matchParticipants,
  players,
} from "@/src/db/schema";

type LegacyPlayerRow = {
  playerName: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
};

type ModernPlayerRow = {
  playerName: string;
  games: number;
  goals: number;
  assists: number;
};

type CombinedPlayerRow = {
  playerName: string;
  legacyGames: number;
  legacyGoals: number;
  legacyAssists: number;
  legacyPoints: number;
  modernGames: number;
  modernGoals: number;
  modernAssists: number;
  totalGames: number;
  totalGoals: number;
  totalAssists: number;
  totalPoints: number;
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
      .where(eq(goalEvents.isOwnGoal, false))
      .groupBy(players.id),
  ]);

  const modernStatsMap = new Map<number, ModernPlayerRow>();

  for (const player of allPlayers) {
    modernStatsMap.set(player.playerId, {
      playerName: player.playerName,
      games: 0,
      goals: 0,
      assists: 0,
    });
  }

  for (const row of gamesByPlayer) {
    const existing = modernStatsMap.get(row.playerId);
    if (existing) {
      existing.games = Number(row.games) || 0;
    }
  }

  for (const row of goalsByPlayer) {
    const existing = modernStatsMap.get(row.playerId);
    if (existing) {
      existing.goals = Number(row.goals) || 0;
    }
  }

  for (const row of assistsByPlayer) {
    const existing = modernStatsMap.get(row.playerId);
    if (existing) {
      existing.assists = Number(row.assists) || 0;
    }
  }

  return Array.from(modernStatsMap.values());
}

function combineStatsByExactName(
  legacyStats: LegacyPlayerRow[],
  modernStats: ModernPlayerRow[]
): CombinedPlayerRow[] {
  const legacyByName = new Map<string, LegacyPlayerRow>();
  const modernByName = new Map<string, ModernPlayerRow>();

  for (const row of legacyStats) {
    legacyByName.set(row.playerName, row);
  }

  for (const row of modernStats) {
    modernByName.set(row.playerName, row);
  }

  const allNames = new Set<string>([...legacyByName.keys(), ...modernByName.keys()]);

  return Array.from(allNames)
    .map((playerName) => {
      const legacy = legacyByName.get(playerName);
      const modern = modernByName.get(playerName);

      const legacyGames = legacy?.games ?? 0;
      const legacyGoals = legacy?.goals ?? 0;
      const legacyAssists = legacy?.assists ?? 0;
      const legacyPoints = legacy?.points ?? 0;

      const modernGames = modern?.games ?? 0;
      const modernGoals = modern?.goals ?? 0;
      const modernAssists = modern?.assists ?? 0;
      const modernPoints = modernGoals + modernAssists;

      return {
        playerName,
        legacyGames,
        legacyGoals,
        legacyAssists,
        legacyPoints,
        modernGames,
        modernGoals,
        modernAssists,
        totalGames: legacyGames + modernGames,
        totalGoals: legacyGoals + modernGoals,
        totalAssists: legacyAssists + modernAssists,
        totalPoints: legacyPoints + modernPoints,
      };
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName, "de"));
}

export default async function CombinedStatsPage() {
  const [legacyStats, modernStats]: [LegacyPlayerRow[], ModernPlayerRow[]] = await Promise.all([
    db
      .select({
        playerName: legacyPlayerCareerStats.playerName,
        games: legacyPlayerCareerStats.games,
        goals: legacyPlayerCareerStats.goals,
        assists: legacyPlayerCareerStats.assists,
        points: legacyPlayerCareerStats.points,
      })
      .from(legacyPlayerCareerStats),
    getModernPlayerStats(),
  ]);

  const combinedStats = combineStatsByExactName(legacyStats, modernStats);

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-7xl rounded-2xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold">Kombinierte Spielerstatistiken</h1>

        {combinedStats.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Keine Daten vorhanden.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-300 bg-stone-50">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-100 text-zinc-600">
                <tr>
                  <th className="px-3 py-2 text-left">Spieler</th>
                  <th className="px-3 py-2 text-left">Legacy Spiele</th>
                  <th className="px-3 py-2 text-left">Legacy Tore</th>
                  <th className="px-3 py-2 text-left">Legacy Vorlagen</th>
                  <th className="px-3 py-2 text-left">Legacy Punkte</th>
                  <th className="px-3 py-2 text-left">Modern Spiele</th>
                  <th className="px-3 py-2 text-left">Modern Tore</th>
                  <th className="px-3 py-2 text-left">Modern Vorlagen</th>
                  <th className="px-3 py-2 text-left">Gesamt Spiele</th>
                  <th className="px-3 py-2 text-left">Gesamt Tore</th>
                  <th className="px-3 py-2 text-left">Gesamt Vorlagen</th>
                  <th className="px-3 py-2 text-left">Gesamt Punkte</th>
                </tr>
              </thead>
              <tbody>
                {combinedStats.map((player) => (
                  <tr key={player.playerName} className="border-t border-zinc-300 bg-white">
                    <td className="px-3 py-2 font-medium text-zinc-900">{player.playerName}</td>
                    <td className="px-3 py-2">{player.legacyGames}</td>
                    <td className="px-3 py-2">{player.legacyGoals}</td>
                    <td className="px-3 py-2">{player.legacyAssists}</td>
                    <td className="px-3 py-2">{player.legacyPoints}</td>
                    <td className="px-3 py-2">{player.modernGames}</td>
                    <td className="px-3 py-2">{player.modernGoals}</td>
                    <td className="px-3 py-2">{player.modernAssists}</td>
                    <td className="px-3 py-2">{player.totalGames}</td>
                    <td className="px-3 py-2">{player.totalGoals}</td>
                    <td className="px-3 py-2">{player.totalAssists}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-900">{player.totalPoints}</td>
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