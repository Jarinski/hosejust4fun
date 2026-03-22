import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

const scorers = alias(players, "scorers");
const assisters = alias(players, "assisters");

type ScorerAssistCombosPageProps = {
  searchParams: Promise<{ seasonId?: string | string[]; sort?: string | string[]; dir?: string | string[] }>;
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
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const dirParam = Array.isArray(params.dir) ? params.dir[0] : params.dir;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;
  const sortKey =
    sortParam === "assister" || sortParam === "scorer" || sortParam === "count"
      ? sortParam
      : "count";
  const sortDir = dirParam === "asc" ? "asc" : "desc";

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

  const sortedCombos = [...combos].sort((a, b) => {
    if (sortKey === "assister") {
      const byAssister = a.assisterName.localeCompare(b.assisterName, "de");
      if (byAssister !== 0) {
        return sortDir === "asc" ? byAssister : -byAssister;
      }

      return b.count - a.count;
    }

    if (sortKey === "scorer") {
      const byScorer = a.scorerName.localeCompare(b.scorerName, "de");
      if (byScorer !== 0) {
        return sortDir === "asc" ? byScorer : -byScorer;
      }

      return b.count - a.count;
    }

    if (a.count !== b.count) {
      return sortDir === "asc" ? a.count - b.count : b.count - a.count;
    }

    const byAssister = a.assisterName.localeCompare(b.assisterName, "de");
    if (byAssister !== 0) {
      return byAssister;
    }

    return a.scorerName.localeCompare(b.scorerName, "de");
  });

  const buildSortHref = (column: "assister" | "scorer" | "count") => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();

    if (validSeasonId) {
      query.set("seasonId", String(validSeasonId));
    }

    query.set("sort", column);
    query.set("dir", nextDir);

    return `?${query.toString()}`;
  };

  const sortArrow = (column: "assister" | "scorer" | "count") => {
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
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("assister")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Vorlagengeber <span className="text-xs">{sortArrow("assister")}</span>
                </Link>
              </th>
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("scorer")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Torschütze <span className="text-xs">{sortArrow("scorer")}</span>
                </Link>
              </th>
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("count")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Anzahl <span className="text-xs">{sortArrow("count")}</span>
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedCombos.map((entry) => (
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