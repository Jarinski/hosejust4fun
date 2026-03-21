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
  searchParams: Promise<{ seasonId?: string | string[] }>;
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

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam &&
    Number.isInteger(parsedSeasonId) &&
    allSeasons.find((season) => season.id === parsedSeasonId);

  const validSeasonId = selectedSeason?.id;

  let participantsQuery = db
    .select({
      matchId: matchParticipants.matchId,
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
    })
    .from(matchParticipants);

  if (validSeasonId) {
    participantsQuery = participantsQuery
      .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
      .where(eq(matches.seasonId, validSeasonId));
  }

  const participants = await participantsQuery;

  const filterUi = (
    <>
      <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="seasonId" className="text-sm text-zinc-300">Saison:</label>
        <select
          id="seasonId"
          name="seasonId"
          defaultValue={validSeasonId?.toString() ?? ""}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
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
          className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm hover:border-zinc-500"
        >
          Filtern
        </button>
      </form>

      <p className="mb-4 text-sm text-zinc-400">
        Aktive Ansicht: {selectedSeason ? selectedSeason.name : "Alle Saisons"}
      </p>

      {seasonIdParam && !selectedSeason ? (
        <p className="mb-4 text-sm text-amber-300">Ungültige Saison gewählt. Es werden alle Saisons angezeigt.</p>
      ) : null}
    </>
  );

  if (participants.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="mb-4 text-sm text-zinc-300">
            <Link href="/admin/matches" className="hover:text-white">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
          {filterUi}
          <p className="text-zinc-400">Noch keine Teilnehmerdaten erfasst.</p>
        </section>
      </main>
    );
  }

  let goalsQuery = db
    .select({
      matchId: goalEvents.matchId,
      teamSide: goalEvents.teamSide,
    })
    .from(goalEvents);

  if (validSeasonId) {
    goalsQuery = goalsQuery
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(eq(matches.seasonId, validSeasonId));
  }

  const goals = await goalsQuery;

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
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="mb-4 text-sm text-zinc-300">
            <Link href="/admin/matches" className="hover:text-white">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
          {filterUi}
          <p className="text-zinc-400">Noch keine Trios vorhanden.</p>
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
    })
    .sort((a, b) => {
      if (b.teamGoals !== a.teamGoals) {
        return b.teamGoals - a.teamGoals;
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/matches" className="hover:text-white">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Trio-Performance</h1>
        {filterUi}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950/70 text-zinc-300">
              <tr>
                <th className="px-4 py-3 text-left">Spieler 1</th>
                <th className="px-4 py-3 text-left">Spieler 2</th>
                <th className="px-4 py-3 text-left">Spieler 3</th>
                <th className="px-4 py-3 text-left">Gemeinsame Spiele</th>
                <th className="px-4 py-3 text-left">Teamtore zusammen</th>
                <th className="px-4 py-3 text-left">Tore pro Spiel</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={`${entry.player1Id}-${entry.player2Id}-${entry.player3Id}`} className="border-t border-zinc-800">
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