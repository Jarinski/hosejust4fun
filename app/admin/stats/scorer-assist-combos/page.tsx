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
    seasonIdParam &&
    Number.isInteger(parsedSeasonId) &&
    allSeasons.find((season) => season.id === parsedSeasonId);

  const validSeasonId = selectedSeason?.id;

  const combosCount = sql<number>`count(${goalEvents.id})`;

  let combosQuery = db
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
    .where(sql`${isNotNull(goalEvents.scorerPlayerId)} and ${isNotNull(goalEvents.assistPlayerId)}`);

  if (validSeasonId) {
    combosQuery = combosQuery
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(
        and(
          isNotNull(goalEvents.scorerPlayerId),
          isNotNull(goalEvents.assistPlayerId),
          eq(matches.seasonId, validSeasonId),
        ),
      );
  }

  const combos = await combosQuery
    .groupBy(assisters.id, assisters.name, scorers.id, scorers.name)
    .orderBy(desc(combosCount), asc(assisters.name), asc(scorers.name));

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/matches">← Zurück zu Matches</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Scorer-Assist-Kombinationen</h1>

      <form method="GET" className="mb-4 flex items-center gap-2">
        <label htmlFor="seasonId">Saison:</label>
        <select id="seasonId" name="seasonId" defaultValue={validSeasonId?.toString() ?? ""}>
          <option value="">Alle Saisons</option>
          {allSeasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
        <button type="submit">Filtern</button>
      </form>

      <p className="mb-4 text-sm text-gray-600">
        Aktive Ansicht: {selectedSeason ? selectedSeason.name : "Alle Saisons"}
      </p>

      {seasonIdParam && !selectedSeason ? (
        <p className="mb-4 text-sm">Ungültige Saison gewählt. Es werden alle Saisons angezeigt.</p>
      ) : null}

      {combos.length === 0 ? (
        <p>Noch keine Scorer-Assist-Kombinationen erfasst.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vorlagengeber</th>
              <th>Torschütze</th>
              <th>Anzahl</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((entry) => (
              <tr key={`${entry.assisterId}-${entry.scorerId}`}>
                <td>{entry.assisterName}</td>
                <td>{entry.scorerName}</td>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}