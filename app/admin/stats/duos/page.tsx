import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { matchParticipants, players } from "@/src/db/schema";

type DuoCount = {
  player1Id: number;
  player2Id: number;
  gamesTogether: number;
};

export default async function DuosPage() {
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
    }))
    .sort((a, b) => {
      if (b.gamesTogether !== a.gamesTogether) {
        return b.gamesTogether - a.gamesTogether;
      }

      const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
      if (byPlayer1 !== 0) {
        return byPlayer1;
      }

      return a.player2Name.localeCompare(b.player2Name, "de");
    });

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
                <th className="px-4 py-3 text-left">Spieler 1</th>
                <th className="px-4 py-3 text-left">Spieler 2</th>
                <th className="px-4 py-3 text-left">Gemeinsame Spiele</th>
              </tr>
            </thead>
            <tbody>
              {duosWithNames.map((duo) => (
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