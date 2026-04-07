import Link from "next/link";
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

type PublicPlayerRow = ModernPlayerRow & {
  legacyGames: number;
  legacyGoals: number;
  legacyAssists: number;
  legacyPoints: number;
  modernPoints: number;
  totalGames: number;
  totalGoals: number;
  totalAssists: number;
  totalPoints: number;
};

async function getModernPlayerStats(isGuest: boolean): Promise<ModernPlayerRow[]> {
  const loadWithGuestFilter = async () => {
    return Promise.all([
      db
        .select({
          playerId: players.id,
          playerName: players.name,
        })
        .from(players)
        .where(eq(players.isGuest, isGuest))
        .orderBy(asc(players.name)),

      db
        .select({
          playerId: players.id,
          games: sql<number>`count(${matchParticipants.id})`,
        })
        .from(matchParticipants)
        .innerJoin(players, eq(matchParticipants.playerId, players.id))
        .where(eq(players.isGuest, isGuest))
        .groupBy(players.id),

      db
        .select({
          playerId: players.id,
          goals: sql<number>`count(${goalEvents.id})`,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
        .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, isGuest)))
        .groupBy(players.id),

      db
        .select({
          playerId: players.id,
          assists: sql<number>`count(${goalEvents.id})`,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
        .where(and(eq(goalEvents.isOwnGoal, false), eq(players.isGuest, isGuest)))
        .groupBy(players.id),
    ]);
  };

  const [allPlayers, gamesByPlayer, goalsByPlayer, assistsByPlayer] = await (async () => {
    try {
      return await loadWithGuestFilter();
    } catch {
      if (isGuest) {
        return [[], [], [], []] as const;
      }

      return Promise.all([
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
    }
  })();

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

type PlayerStatsPageProps = {
  searchParams: Promise<{ sort?: string | string[]; dir?: string | string[] }>;
};

export default async function PlayerStatsPage({ searchParams }: PlayerStatsPageProps) {
  const params = await searchParams;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;
  const sortKey =
    sortParam === "player" ||
    sortParam === "games" ||
    sortParam === "goals" ||
    sortParam === "assists" ||
    sortParam === "points"
      ? sortParam
      : "player";
  const sortDir = dirParam === "desc" ? "desc" : "asc";

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
    getModernPlayerStats(false),
  ]);

  const sortedLegacyStats = [...legacyStats].sort((a, b) => {
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

  const buildSortHref = (column: "player" | "games" | "goals" | "assists" | "points") => {
    const nextDir = sortKey === column && sortDir === "asc" ? "desc" : "asc";
    const query = new URLSearchParams();
    query.set("sort", column);
    query.set("dir", nextDir);
    return `?${query.toString()}`;
  };

  const sortArrow = (column: "player" | "games" | "goals" | "assists" | "points") => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

  const legacyByPlayerName = new Map<string, LegacyPlayerRow>(
    legacyStats.map((row) => [row.playerName, row])
  );

  const publicPlayerStats: PublicPlayerRow[] = modernStats.map((player) => {
    const legacy = legacyByPlayerName.get(player.playerName);
    const legacyGames = legacy?.games ?? 0;
    const legacyGoals = legacy?.goals ?? 0;
    const legacyAssists = legacy?.assists ?? 0;
    const legacyPoints = legacy?.points ?? 0;
    const modernPoints = player.goals + player.assists;

    return {
      ...player,
      legacyGames,
      legacyGoals,
      legacyAssists,
      legacyPoints,
      modernPoints,
      totalGames: legacyGames + player.games,
      totalGoals: legacyGoals + player.goals,
      totalAssists: legacyAssists + player.assists,
      totalPoints: legacyPoints + modernPoints,
    };
  });

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
                      <th className="px-3 py-2 text-left"><Link href={buildSortHref("player")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler <span className="text-xs">{sortArrow("player")}</span></Link></th>
                      <th className="px-3 py-2 text-left"><Link href={buildSortHref("games")} className="inline-flex items-center gap-1 hover:text-zinc-900">Einsätze <span className="text-xs">{sortArrow("games")}</span></Link></th>
                      <th className="px-3 py-2 text-left"><Link href={buildSortHref("goals")} className="inline-flex items-center gap-1 hover:text-zinc-900">Tore <span className="text-xs">{sortArrow("goals")}</span></Link></th>
                      <th className="px-3 py-2 text-left"><Link href={buildSortHref("assists")} className="inline-flex items-center gap-1 hover:text-zinc-900">Vorlagen <span className="text-xs">{sortArrow("assists")}</span></Link></th>
                      <th className="px-3 py-2 text-left"><Link href={buildSortHref("points")} className="inline-flex items-center gap-1 hover:text-zinc-900">Punkte <span className="text-xs">{sortArrow("points")}</span></Link></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLegacyStats.map((player) => (
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

            {publicPlayerStats.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Keine modernen Spielerstatistiken vorhanden.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {publicPlayerStats.map((player) => (
                  <li key={player.playerId} className="rounded-lg border border-zinc-300 bg-white p-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                      <p className="font-medium text-zinc-900">
                        <Link href={`/admin/players/${player.playerId}`} className="hover:underline">
                          {player.playerName}
                        </Link>
                      </p>
                      <p className="text-sm text-zinc-700">Modern Tore: <span className="font-semibold text-zinc-900">{player.goals}</span></p>
                      <p className="text-sm text-zinc-700">Legacy Tore: <span className="font-semibold text-zinc-900">{player.legacyGoals}</span></p>
                      <p className="text-sm text-zinc-700">Gesamt Tore: <span className="font-semibold text-zinc-900">{player.totalGoals}</span></p>
                    </div>

                    <details className="mt-3 rounded-md border border-zinc-300 bg-stone-50 p-2.5">
                      <summary className="cursor-pointer text-sm font-medium text-zinc-800">Details</summary>

                      <div className="mt-3 grid gap-3 lg:grid-cols-3">
                        <section className="rounded-md border border-zinc-300 bg-white p-3 text-sm">
                          <h3 className="font-semibold text-zinc-900">Legacy</h3>
                          <p className="mt-1 text-zinc-700">Einsätze: <span className="font-medium text-zinc-900">{player.legacyGames}</span></p>
                          <p className="text-zinc-700">Tore: <span className="font-medium text-zinc-900">{player.legacyGoals}</span></p>
                          <p className="text-zinc-700">Vorlagen: <span className="font-medium text-zinc-900">{player.legacyAssists}</span></p>
                          <p className="text-zinc-700">Punkte: <span className="font-medium text-zinc-900">{player.legacyPoints}</span></p>
                        </section>

                        <section className="rounded-md border border-zinc-300 bg-white p-3 text-sm">
                          <h3 className="font-semibold text-zinc-900">Modern</h3>
                          <p className="mt-1 text-zinc-700">Einsätze: <span className="font-medium text-zinc-900">{player.games}</span></p>
                          <p className="text-zinc-700">Tore: <span className="font-medium text-zinc-900">{player.goals}</span></p>
                          <p className="text-zinc-700">Vorlagen: <span className="font-medium text-zinc-900">{player.assists}</span></p>
                          <p className="text-zinc-700">Punkte: <span className="font-medium text-zinc-900">{player.modernPoints}</span></p>
                        </section>

                        <section className="rounded-md border border-zinc-300 bg-white p-3 text-sm">
                          <h3 className="font-semibold text-zinc-900">Gesamt</h3>
                          <p className="mt-1 text-zinc-700">Einsätze: <span className="font-medium text-zinc-900">{player.totalGames}</span></p>
                          <p className="text-zinc-700">Tore: <span className="font-medium text-zinc-900">{player.totalGoals}</span></p>
                          <p className="text-zinc-700">Vorlagen: <span className="font-medium text-zinc-900">{player.totalAssists}</span></p>
                          <p className="text-zinc-700">Punkte: <span className="font-medium text-zinc-900">{player.totalPoints}</span></p>
                        </section>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}