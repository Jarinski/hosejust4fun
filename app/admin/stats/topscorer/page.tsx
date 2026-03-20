import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
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
    .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id));

  if (validSeasonId) {
    topScorersQuery = topScorersQuery
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(eq(matches.seasonId, validSeasonId));
  }

  const topScorers = await topScorersQuery
    .groupBy(players.id, players.name)
    .orderBy(desc(goalsCount), asc(players.name));

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/matches">← Zurück zu Matches</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">Topscorer</h1>

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

      {topScorers.length === 0 ? (
        <p>Noch keine Tore erfasst.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Spieler</th>
              <th>Tore</th>
            </tr>
          </thead>
          <tbody>
            {topScorers.map((entry) => (
              <tr key={entry.playerId}>
                <td>{entry.playerName}</td>
                <td>{entry.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}