import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { matchParticipants, players } from "@/src/db/schema";

type DuoCount = {
  player1Id: number;
  player2Id: number;
  gamesTogether: number;
};

type DuosPageProps = {
  searchParams: Promise<{ sort?: string | string[]; dir?: string | string[] }>;
};

export default async function DuosPage({ searchParams }: DuosPageProps) {
  const params = await searchParams;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;
  const sortKey = sortParam === "player1" || sortParam === "player2" || sortParam === "games" ? sortParam : "games";
  const sortDir = dirParam === "asc" ? "asc" : "desc";
  const participants = await db
    .select({
      matchId: matchParticipants.matchId,
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
    })
    .from(matchParticipants);

  if (participants.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Top-Duos</h1>
          <p className="text-zinc-500">Noch keine Teilnehmerdaten erfasst.</p>
        </section>
      </main>
    );
  }

  const teamsByMatch = new Map<string, Set<number>>();

  for (const participant of participants) {
    const teamKey = `${participant.matchId}-${participant.teamSide}`;
    const currentTeam = teamsByMatch.get(teamKey) ?? new Set<number>();
    currentTeam.add(participant.playerId);
    teamsByMatch.set(teamKey, currentTeam);
  }

  const duoCounter = new Map<string, number>();

  for (const teamPlayers of teamsByMatch.values()) {
    const sortedPlayerIds = Array.from(teamPlayers).sort((a, b) => a - b);

    for (let i = 0; i < sortedPlayerIds.length - 1; i++) {
      for (let j = i + 1; j < sortedPlayerIds.length; j++) {
        const player1Id = sortedPlayerIds[i];
        const player2Id = sortedPlayerIds[j];
        const duoKey = `${player1Id}-${player2Id}`;

        duoCounter.set(duoKey, (duoCounter.get(duoKey) ?? 0) + 1);
      }
    }
  }

  const duoCounts: DuoCount[] = Array.from(duoCounter.entries()).map(
    ([duoKey, gamesTogether]) => {
      const [player1Id, player2Id] = duoKey.split("-").map(Number);

      return {
        player1Id,
        player2Id,
        gamesTogether,
      };
    },
  );

  if (duoCounts.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Top-Duos</h1>
          <p className="text-zinc-500">Noch keine Duos vorhanden.</p>
        </section>
      </main>
    );
  }

  const playerIds = Array.from(
    new Set(duoCounts.flatMap((duo) => [duo.player1Id, duo.player2Id])),
  );

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
    })
    .from(players)
    .where(inArray(players.id, playerIds));

  const playerNameById = new Map(playerRows.map((player) => [player.id, player.name]));

  const duosWithNames = duoCounts
    .map((duo) => ({
      ...duo,
      player1Name: playerNameById.get(duo.player1Id) ?? `Spieler #${duo.player1Id}`,
      player2Name: playerNameById.get(duo.player2Id) ?? `Spieler #${duo.player2Id}`,
    }));

  const sortedDuos = [...duosWithNames].sort((a, b) => {
    if (sortKey === "player1") {
      const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
      if (byPlayer1 !== 0) {
        return sortDir === "asc" ? byPlayer1 : -byPlayer1;
      }

      return b.gamesTogether - a.gamesTogether;
    }

    if (sortKey === "player2") {
      const byPlayer2 = a.player2Name.localeCompare(b.player2Name, "de");
      if (byPlayer2 !== 0) {
        return sortDir === "asc" ? byPlayer2 : -byPlayer2;
      }

      return b.gamesTogether - a.gamesTogether;
    }

    if (a.gamesTogether !== b.gamesTogether) {
      return sortDir === "asc"
        ? a.gamesTogether - b.gamesTogether
        : b.gamesTogether - a.gamesTogether;
    }

    const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
    if (byPlayer1 !== 0) {
      return byPlayer1;
    }

    return a.player2Name.localeCompare(b.player2Name, "de");
  });

  const buildSortHref = (column: "player1" | "player2" | "games") => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();
    query.set("sort", column);
    query.set("dir", nextDir);
    return `?${query.toString()}`;
  };

  const sortArrow = (column: "player1" | "player2" | "games") => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Top-Duos</h1>

        <div className="overflow-x-auto rounded-xl border border-zinc-300">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("player1")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Spieler 1 <span className="text-xs">{sortArrow("player1")}</span>
                  </Link>
                </th>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("player2")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Spieler 2 <span className="text-xs">{sortArrow("player2")}</span>
                  </Link>
                </th>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("games")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Gemeinsame Spiele <span className="text-xs">{sortArrow("games")}</span>
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDuos.map((duo) => (
                <tr key={`${duo.player1Id}-${duo.player2Id}`} className="border-t border-zinc-300">
                  <td className="px-4 py-3">{duo.player1Name}</td>
                  <td className="px-4 py-3">{duo.player2Name}</td>
                  <td className="px-4 py-3 font-semibold text-red-300">{duo.gamesTogether}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}