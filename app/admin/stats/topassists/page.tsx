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
    seasonIdParam &&
    Number.isInteger(parsedSeasonId) &&
    allSeasons.find((season) => season.id === parsedSeasonId);

  const validSeasonId = selectedSeason?.id;

  const assistsCount = sql<number>`count(${goalEvents.id})`;

  let topAssistsQuery = db
    .select({
      playerId: players.id,
      playerName: players.name,
      assists: assistsCount.as("assists"),
    })
    .from(goalEvents)
    .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
    .where(isNotNull(goalEvents.assistPlayerId));

  if (validSeasonId) {
    topAssistsQuery = topAssistsQuery
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(isNotNull(goalEvents.assistPlayerId), eq(matches.seasonId, validSeasonId)));
  }

  const topAssists = await topAssistsQuery
    .groupBy(players.id, players.name)
    .orderBy(desc(assistsCount), asc(players.name));

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/matches">← Zurück zu Matches</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Top-Assists</h1>

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

      {topAssists.length === 0 ? (
        <p>Noch keine Assists erfasst.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Spieler</th>
              <th>Assists</th>
            </tr>
          </thead>
          <tbody>
            {topAssists.map((entry) => (
              <tr key={entry.playerId}>
                <td>{entry.playerName}</td>
                <td>{entry.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}