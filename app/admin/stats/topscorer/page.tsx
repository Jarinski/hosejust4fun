import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

type TopscorerPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

export default async function TopscorerPage({ searchParams }: TopscorerPageProps) {
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

  const goalsCount = sql<number>`count(${goalEvents.id})`;

  let topScorersQuery = db
    .select({
      playerId: players.id,
      playerName: players.name,
      goals: goalsCount.as("goals"),
    })
    .from(goalEvents)
    .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
    .where(eq(goalEvents.isOwnGoal, false));

  if (validSeasonId) {
    topScorersQuery = topScorersQuery
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(eq(goalEvents.isOwnGoal, false), eq(matches.seasonId, validSeasonId)));
  }

  const topScorers = await topScorersQuery
    .groupBy(players.id, players.name)
    .orderBy(desc(goalsCount), asc(players.name));

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
      <p className="mb-4 text-sm text-zinc-300">
        <Link href="/admin/matches" className="hover:text-white">← Zurück zu Matches</Link>
      </p>

      <h1 className="mb-4 text-2xl font-semibold">Topscorer</h1>

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

      {topScorers.length === 0 ? (
        <p className="text-zinc-400">Noch keine Tore erfasst.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-950/70 text-zinc-300">
            <tr>
              <th className="px-4 py-3 text-left">Spieler</th>
              <th className="px-4 py-3 text-left">Tore</th>
            </tr>
          </thead>
          <tbody>
            {topScorers.map((entry) => (
              <tr key={entry.playerId} className="border-t border-zinc-800">
                <td className="px-4 py-3">{entry.playerName}</td>
                <td className="px-4 py-3 font-semibold text-red-300">{entry.goals}</td>
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