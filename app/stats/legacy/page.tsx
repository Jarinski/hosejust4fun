import Link from "next/link";
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

type LegacyStatsPageProps = {
  searchParams: Promise<{ sort?: string | string[]; dir?: string | string[] }>;
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

export default async function LegacyStatsPage({ searchParams }: LegacyStatsPageProps) {
  const params = await searchParams;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;
  const sortKey =
    sortParam === "player" ||
    sortParam === "goals" ||
    sortParam === "assists" ||
    sortParam === "points" ||
    sortParam === "games"
      ? sortParam
      : "points";
  const sortDir = dirParam === "asc" ? "asc" : "desc";

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

  const sortedAllPlayers = [...allPlayers].sort((a, b) => {
    if (sortKey === "player") {
      const byName = a.playerName.localeCompare(b.playerName, "de");
      if (byName !== 0) {
        return sortDir === "asc" ? byName : -byName;
      }

      return b.points - a.points;
    }

    if (sortKey === "goals") {
      if (a.goals !== b.goals) {
        return sortDir === "asc" ? a.goals - b.goals : b.goals - a.goals;
      }

      return b.points - a.points;
    }

    if (sortKey === "assists") {
      if (a.assists !== b.assists) {
        return sortDir === "asc" ? a.assists - b.assists : b.assists - a.assists;
      }

      return b.points - a.points;
    }

    if (sortKey === "games") {
      if (a.games !== b.games) {
        return sortDir === "asc" ? a.games - b.games : b.games - a.games;
      }

      return b.points - a.points;
    }

    if (a.points !== b.points) {
      return sortDir === "asc" ? a.points - b.points : b.points - a.points;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const buildSortHref = (column: "player" | "goals" | "assists" | "points" | "games") => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();
    query.set("sort", column);
    query.set("dir", nextDir);
    return `?${query.toString()}`;
  };

  const sortArrow = (column: "player" | "goals" | "assists" | "points" | "games") => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

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
                    <th className="px-3 py-2 text-left"><Link href={buildSortHref("player")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler <span className="text-xs">{sortArrow("player")}</span></Link></th>
                    <th className="px-3 py-2 text-left"><Link href={buildSortHref("goals")} className="inline-flex items-center gap-1 hover:text-zinc-900">Tore <span className="text-xs">{sortArrow("goals")}</span></Link></th>
                    <th className="px-3 py-2 text-left"><Link href={buildSortHref("assists")} className="inline-flex items-center gap-1 hover:text-zinc-900">Vorlagen <span className="text-xs">{sortArrow("assists")}</span></Link></th>
                    <th className="px-3 py-2 text-left"><Link href={buildSortHref("points")} className="inline-flex items-center gap-1 hover:text-zinc-900">Punkte <span className="text-xs">{sortArrow("points")}</span></Link></th>
                    <th className="px-3 py-2 text-left"><Link href={buildSortHref("games")} className="inline-flex items-center gap-1 hover:text-zinc-900">Einsätze <span className="text-xs">{sortArrow("games")}</span></Link></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAllPlayers.map((player) => (
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