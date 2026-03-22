import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

type TopAssistsPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

export default async function TopAssistsPage({ searchParams }: TopAssistsPageProps) {
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
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;

  const assistsCount = sql<number>`count(${goalEvents.id})`;

  const topAssists = validSeasonId
    ? await db
        .select({
          playerId: players.id,
          playerName: players.name,
          assists: assistsCount.as("assists"),
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(
          and(
            isNotNull(goalEvents.assistPlayerId),
            eq(goalEvents.isOwnGoal, false),
            eq(players.isGoalkeeper, false),
            eq(matches.seasonId, validSeasonId),
          ),
        )
        .groupBy(players.id, players.name)
        .orderBy(desc(assistsCount), asc(players.name))
    : await db
        .select({
          playerId: players.id,
          playerName: players.name,
          assists: assistsCount.as("assists"),
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
        .where(
          and(
            isNotNull(goalEvents.assistPlayerId),
            eq(goalEvents.isOwnGoal, false),
            eq(players.isGoalkeeper, false),
          ),
        )
        .groupBy(players.id, players.name)
        .orderBy(desc(assistsCount), asc(players.name));

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
      <p className="mb-4 text-sm text-zinc-600">
        <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
      </p>

      <h1 className="mb-4 text-2xl font-semibold">Top-Assists</h1>

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

      {topAssists.length === 0 ? (
        <p className="text-zinc-500">Noch keine Assists erfasst.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-300">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 text-left">Spieler</th>
              <th className="px-4 py-3 text-left">Assists</th>
            </tr>
          </thead>
          <tbody>
            {topAssists.map((entry) => (
              <tr key={entry.playerId} className="border-t border-zinc-300">
                <td className="px-4 py-3">{entry.playerName}</td>
                <td className="px-4 py-3 font-semibold text-red-300">{entry.assists}</td>
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