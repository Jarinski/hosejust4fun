import { and, asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
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
  const [allPlayers, gamesByPlayer, goalsByPlayer, assistsByPlayer] = await (async () => {
    try {
      return await Promise.all([
        db
          .select({
            playerId: players.id,
            playerName: players.name,
          })
          .from(players)
          .where(eq(players.isGuest, false))
          .orderBy(asc(players.name)),
        db
          .select({
            playerId: players.id,
            games: sql<number>`count(${matchParticipants.id})`,
          })
          .from(matchParticipants)
          .innerJoin(players, eq(matchParticipants.playerId, players.id))
          .where(eq(players.isGuest, false))
          .groupBy(players.id),
        db
          .select({
            playerId: players.id,
            goals: sql<number>`count(${goalEvents.id})`,
          })
          .from(goalEvents)
          .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
          .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, false)))
          .groupBy(players.id),
        db
          .select({
            playerId: players.id,
            assists: sql<number>`count(${goalEvents.id})`,
          })
          .from(goalEvents)
          .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
          .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, false)))
          .groupBy(players.id),
      ]);
    } catch {
      return await Promise.all([
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
    }
  })();

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
    });
}

type CombinedStatsPageProps = {
  searchParams: Promise<{ sort?: string | string[]; dir?: string | string[] }>;
};

export default async function CombinedStatsPage({ searchParams }: CombinedStatsPageProps) {
  const params = await searchParams;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;
  const sortKey =
    sortParam === "player" ||
    sortParam === "legacyGames" ||
    sortParam === "legacyGoals" ||
    sortParam === "legacyAssists" ||
    sortParam === "legacyPoints" ||
    sortParam === "modernGames" ||
    sortParam === "modernGoals" ||
    sortParam === "modernAssists" ||
    sortParam === "totalGames" ||
    sortParam === "totalGoals" ||
    sortParam === "totalAssists" ||
    sortParam === "totalPoints"
      ? sortParam
      : "player";
  const sortDir = dirParam === "desc" ? "desc" : "asc";

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

  const sortedCombinedStats = [...combinedStats].sort((a, b) => {
    if (sortKey === "player") {
      const byName = a.playerName.localeCompare(b.playerName, "de");
      return sortDir === "asc" ? byName : -byName;
    }

    const byValue = Number(a[sortKey]) - Number(b[sortKey]);
    if (byValue !== 0) {
      return sortDir === "asc" ? byValue : -byValue;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const buildSortHref = (
    column:
      | "player"
      | "legacyGames"
      | "legacyGoals"
      | "legacyAssists"
      | "legacyPoints"
      | "modernGames"
      | "modernGoals"
      | "modernAssists"
      | "totalGames"
      | "totalGoals"
      | "totalAssists"
      | "totalPoints",
  ) => {
    const nextDir = sortKey === column && sortDir === "asc" ? "desc" : "asc";
    const query = new URLSearchParams();
    query.set("sort", column);
    query.set("dir", nextDir);
    return `?${query.toString()}`;
  };

  const sortArrow = (
    column:
      | "player"
      | "legacyGames"
      | "legacyGoals"
      | "legacyAssists"
      | "legacyPoints"
      | "modernGames"
      | "modernGoals"
      | "modernAssists"
      | "totalGames"
      | "totalGoals"
      | "totalAssists"
      | "totalPoints",
  ) => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

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
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("player")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler <span className="text-xs">{sortArrow("player")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("legacyGames")} className="inline-flex items-center gap-1 hover:text-zinc-900">Legacy Spiele <span className="text-xs">{sortArrow("legacyGames")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("legacyGoals")} className="inline-flex items-center gap-1 hover:text-zinc-900">Legacy Tore <span className="text-xs">{sortArrow("legacyGoals")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("legacyAssists")} className="inline-flex items-center gap-1 hover:text-zinc-900">Legacy Vorlagen <span className="text-xs">{sortArrow("legacyAssists")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("legacyPoints")} className="inline-flex items-center gap-1 hover:text-zinc-900">Legacy Punkte <span className="text-xs">{sortArrow("legacyPoints")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("modernGames")} className="inline-flex items-center gap-1 hover:text-zinc-900">Modern Spiele <span className="text-xs">{sortArrow("modernGames")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("modernGoals")} className="inline-flex items-center gap-1 hover:text-zinc-900">Modern Tore <span className="text-xs">{sortArrow("modernGoals")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("modernAssists")} className="inline-flex items-center gap-1 hover:text-zinc-900">Modern Vorlagen <span className="text-xs">{sortArrow("modernAssists")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("totalGames")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gesamt Spiele <span className="text-xs">{sortArrow("totalGames")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("totalGoals")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gesamt Tore <span className="text-xs">{sortArrow("totalGoals")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("totalAssists")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gesamt Vorlagen <span className="text-xs">{sortArrow("totalAssists")}</span></Link></th>
                  <th className="px-3 py-2 text-left"><Link href={buildSortHref("totalPoints")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gesamt Punkte <span className="text-xs">{sortArrow("totalPoints")}</span></Link></th>
                </tr>
              </thead>
              <tbody>
                {sortedCombinedStats.map((player) => (
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