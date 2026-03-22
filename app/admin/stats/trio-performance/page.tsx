import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players, seasons } from "@/src/db/schema";

type TrioPerformance = {
  player1Id: number;
  player2Id: number;
  player3Id: number;
  gamesTogether: number;
  teamGoals: number;
};

type TrioPerformancePageProps = {
  searchParams: Promise<{
    seasonId?: string | string[];
    sort?: string | string[];
    dir?: string | string[];
  }>;
};

export default async function TrioPerformancePage({ searchParams }: TrioPerformancePageProps) {
  const allSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
    })
    .from(seasons)
    .orderBy(desc(seasons.startDate), desc(seasons.id));

  const params = await searchParams;
  const seasonIdParam = Array.isArray(params.seasonId)
    ? params.seasonId[0]
    : params.seasonId;
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;
  const sortKey =
    sortParam === "player1" ||
    sortParam === "player2" ||
    sortParam === "player3" ||
    sortParam === "games" ||
    sortParam === "goals" ||
    sortParam === "gpg"
      ? sortParam
      : "goals";
  const sortDir = dirParam === "asc" ? "asc" : "desc";

  const participants = validSeasonId
    ? await db
        .select({
          matchId: matchParticipants.matchId,
          playerId: matchParticipants.playerId,
          teamSide: matchParticipants.teamSide,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
    : await db
        .select({
          matchId: matchParticipants.matchId,
          playerId: matchParticipants.playerId,
          teamSide: matchParticipants.teamSide,
        })
        .from(matchParticipants);

  const filterUi = (
    <>
      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="seasonId" className="text-sm text-zinc-600">Saison:</label>
        <select
          id="seasonId"
          name="seasonId"
          defaultValue={validSeasonId?.toString() ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Alle Saisons</option>
          {allSeasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 bg-stone-50 px-3 py-2 text-sm hover:border-zinc-500"
        >
          Filtern
        </button>
      </form>

      <p className="mb-4 text-sm text-zinc-500">
        Aktive Ansicht: {selectedSeason ? selectedSeason.name : "Alle Saisons"}
      </p>

      {seasonIdParam && !selectedSeason ? (
        <p className="mb-4 text-sm text-amber-300">Ungültige Saison gewählt. Es werden alle Saisons angezeigt.</p>
      ) : null}
    </>
  );

  if (participants.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
          {filterUi}
          <p className="text-zinc-500">Noch keine Teilnehmerdaten erfasst.</p>
        </section>
      </main>
    );
  }

  const goals = validSeasonId
    ? await db
        .select({
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
        })
        .from(goalEvents)
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
    : await db
        .select({
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
        })
        .from(goalEvents);

  const teamGoalsByMatch = new Map<string, number>();

  for (const goal of goals) {
    const key = `${goal.matchId}-${goal.teamSide}`;
    teamGoalsByMatch.set(key, (teamGoalsByMatch.get(key) ?? 0) + 1);
  }

  const teamsByMatch = new Map<string, Set<number>>();

  for (const participant of participants) {
    const key = `${participant.matchId}-${participant.teamSide}`;
    const teamPlayers = teamsByMatch.get(key) ?? new Set<number>();
    teamPlayers.add(participant.playerId);
    teamsByMatch.set(key, teamPlayers);
  }

  const trioStats = new Map<string, TrioPerformance>();

  for (const [teamKey, teamPlayers] of teamsByMatch.entries()) {
    const playerIds = Array.from(teamPlayers).sort((a, b) => a - b);
    const teamGoals = teamGoalsByMatch.get(teamKey) ?? 0;

    if (playerIds.length < 3) {
      continue;
    }

    for (let i = 0; i < playerIds.length - 2; i++) {
      for (let j = i + 1; j < playerIds.length - 1; j++) {
        for (let k = j + 1; k < playerIds.length; k++) {
          const player1Id = playerIds[i];
          const player2Id = playerIds[j];
          const player3Id = playerIds[k];
          const trioKey = `${player1Id}-${player2Id}-${player3Id}`;

          const current = trioStats.get(trioKey) ?? {
            player1Id,
            player2Id,
            player3Id,
            gamesTogether: 0,
            teamGoals: 0,
          };

          current.gamesTogether += 1;
          current.teamGoals += teamGoals;

          trioStats.set(trioKey, current);
        }
      }
    }
  }

  const trioPerformance = Array.from(trioStats.values());

  if (trioPerformance.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
          {filterUi}
          <p className="text-zinc-500">Noch keine Trios vorhanden.</p>
        </section>
      </main>
    );
  }

  const trioPlayerIds = Array.from(
    new Set(
      trioPerformance.flatMap((entry) => [
        entry.player1Id,
        entry.player2Id,
        entry.player3Id,
      ]),
    ),
  );

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
    })
    .from(players)
    .where(inArray(players.id, trioPlayerIds));

  const playerNameById = new Map(playerRows.map((player) => [player.id, player.name]));

  const rows = trioPerformance
    .map((entry) => {
      const player1Name =
        playerNameById.get(entry.player1Id) ?? `Spieler #${entry.player1Id}`;
      const player2Name =
        playerNameById.get(entry.player2Id) ?? `Spieler #${entry.player2Id}`;
      const player3Name =
        playerNameById.get(entry.player3Id) ?? `Spieler #${entry.player3Id}`;

      return {
        ...entry,
        player1Name,
        player2Name,
        player3Name,
        goalsPerGame:
          entry.gamesTogether > 0
            ? (entry.teamGoals / entry.gamesTogether).toFixed(2)
            : "0.00",
      };
    });

  const sortedRows = [...rows].sort((a, b) => {
    if (sortKey === "player1") {
      const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
      if (byPlayer1 !== 0) {
        return sortDir === "asc" ? byPlayer1 : -byPlayer1;
      }

      return b.teamGoals - a.teamGoals;
    }

    if (sortKey === "player2") {
      const byPlayer2 = a.player2Name.localeCompare(b.player2Name, "de");
      if (byPlayer2 !== 0) {
        return sortDir === "asc" ? byPlayer2 : -byPlayer2;
      }

      return b.teamGoals - a.teamGoals;
    }

    if (sortKey === "player3") {
      const byPlayer3 = a.player3Name.localeCompare(b.player3Name, "de");
      if (byPlayer3 !== 0) {
        return sortDir === "asc" ? byPlayer3 : -byPlayer3;
      }

      return b.teamGoals - a.teamGoals;
    }

    if (sortKey === "games") {
      if (a.gamesTogether !== b.gamesTogether) {
        return sortDir === "asc"
          ? a.gamesTogether - b.gamesTogether
          : b.gamesTogether - a.gamesTogether;
      }

      return b.teamGoals - a.teamGoals;
    }

    if (sortKey === "gpg") {
      const gpgDiff = Number(a.goalsPerGame) - Number(b.goalsPerGame);
      if (gpgDiff !== 0) {
        return sortDir === "asc" ? gpgDiff : -gpgDiff;
      }

      return b.teamGoals - a.teamGoals;
    }

    if (a.teamGoals !== b.teamGoals) {
      return sortDir === "asc" ? a.teamGoals - b.teamGoals : b.teamGoals - a.teamGoals;
    }

    if (b.gamesTogether !== a.gamesTogether) {
      return b.gamesTogether - a.gamesTogether;
    }

    const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
    if (byPlayer1 !== 0) {
      return byPlayer1;
    }

    const byPlayer2 = a.player2Name.localeCompare(b.player2Name, "de");
    if (byPlayer2 !== 0) {
      return byPlayer2;
    }

    return a.player3Name.localeCompare(b.player3Name, "de");
  });

  const buildSortHref = (
    column: "player1" | "player2" | "player3" | "games" | "goals" | "gpg",
  ) => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();

    if (validSeasonId) {
      query.set("seasonId", String(validSeasonId));
    }

    query.set("sort", column);
    query.set("dir", nextDir);

    return `?${query.toString()}`;
  };

  const sortArrow = (
    column: "player1" | "player2" | "player3" | "games" | "goals" | "gpg",
  ) => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
        {filterUi}

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
                  <Link href={buildSortHref("player3")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Spieler 3 <span className="text-xs">{sortArrow("player3")}</span>
                  </Link>
                </th>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("games")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Gemeinsame Spiele <span className="text-xs">{sortArrow("games")}</span>
                  </Link>
                </th>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("goals")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Teamtore zusammen <span className="text-xs">{sortArrow("goals")}</span>
                  </Link>
                </th>
                <th className="px-4 py-3 text-left">
                  <Link href={buildSortHref("gpg")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                    Tore pro Spiel <span className="text-xs">{sortArrow("gpg")}</span>
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((entry) => (
                <tr key={`${entry.player1Id}-${entry.player2Id}-${entry.player3Id}`} className="border-t border-zinc-300">
                  <td className="px-4 py-3">{entry.player1Name}</td>
                  <td className="px-4 py-3">{entry.player2Name}</td>
                  <td className="px-4 py-3">{entry.player3Name}</td>
                  <td className="px-4 py-3">{entry.gamesTogether}</td>
                  <td className="px-4 py-3">{entry.teamGoals}</td>
                  <td className="px-4 py-3 font-semibold text-red-300">{entry.goalsPerGame}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}