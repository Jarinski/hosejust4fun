import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

const scorers = alias(players, "scorers");
const assisters = alias(players, "assisters");

type ScorerAssistCombosPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

export default async function ScorerAssistCombosPage({
  searchParams,
}: ScorerAssistCombosPageProps) {
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

  const combosCount = sql<number>`count(${goalEvents.id})`;

  const combos = validSeasonId
    ? await db
        .select({
          assisterId: assisters.id,
          assisterName: assisters.name,
          scorerId: scorers.id,
          scorerName: scorers.name,
          count: combosCount.as("count"),
        })
        .from(goalEvents)
        .innerJoin(assisters, eq(goalEvents.assistPlayerId, assisters.id))
        .innerJoin(scorers, eq(goalEvents.scorerPlayerId, scorers.id))
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(
          and(
            isNotNull(goalEvents.scorerPlayerId),
            isNotNull(goalEvents.assistPlayerId),
            eq(goalEvents.isOwnGoal, false),
            eq(matches.seasonId, validSeasonId),
          ),
        )
        .groupBy(assisters.id, assisters.name, scorers.id, scorers.name)
        .orderBy(desc(combosCount), asc(assisters.name), asc(scorers.name))
    : await db
        .select({
          assisterId: assisters.id,
          assisterName: assisters.name,
          scorerId: scorers.id,
          scorerName: scorers.name,
          count: combosCount.as("count"),
        })
        .from(goalEvents)
        .innerJoin(assisters, eq(goalEvents.assistPlayerId, assisters.id))
        .innerJoin(scorers, eq(goalEvents.scorerPlayerId, scorers.id))
        .where(
          sql`${isNotNull(goalEvents.scorerPlayerId)} and ${isNotNull(goalEvents.assistPlayerId)} and ${eq(goalEvents.isOwnGoal, false)}`,
        )
        .groupBy(assisters.id, assisters.name, scorers.id, scorers.name)
        .orderBy(desc(combosCount), asc(assisters.name), asc(scorers.name));

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
      <p className="mb-4 text-sm text-zinc-600">
        <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
      </p>

      <h1 className="mb-4 text-2xl font-semibold">Scorer-Assist-Kombinationen</h1>

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

      {combos.length === 0 ? (
        <p className="text-zinc-500">Noch keine Scorer-Assist-Kombinationen erfasst.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-300">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 text-left">Vorlagengeber</th>
              <th className="px-4 py-3 text-left">Torschütze</th>
              <th className="px-4 py-3 text-left">Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((entry) => (
              <tr key={`${entry.assisterId}-${entry.scorerId}`} className="border-t border-zinc-300">
                <td className="px-4 py-3">{entry.assisterName}</td>
                <td className="px-4 py-3">{entry.scorerName}</td>
                <td className="px-4 py-3 font-semibold text-red-300">{entry.count}</td>
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