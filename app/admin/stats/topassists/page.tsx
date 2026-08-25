import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipantPrimary, matches, players, seasons } from "@/src/db/schema";

type TopAssistsPageProps = {
  searchParams: Promise<{ seasonId?: string | string[]; sort?: string | string[]; dir?: string | string[] }>;
};

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybePgError = error as { code?: string; message?: string };

  if (typeof maybePgError.message === "string" && maybePgError.message.includes(columnName)) {
    return true;
  }

  return maybePgError.code === "42703";
}

export default async function TopAssistsPage({ searchParams }: TopAssistsPageProps) {
  const MODERN_START_DATE = new Date("2026-01-01T00:00:00.000Z");

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
    sortParam === "player" || sortParam === "assists" || sortParam === "assistsPerGame"
      ? sortParam
      : "assists";
  const sortDir = dirParam === "asc" ? "asc" : "desc";

  const assistsCount = sql<number>`count(${goalEvents.id})`;

  let ownGoalColumnAvailable = true;
  let goalkeeperColumnAvailable = true;

  const queryTopAssists = async (options: { filterOwnGoals: boolean; filterGoalkeepers: boolean }) => {
    const filters = [isNotNull(goalEvents.assistPlayerId)];

    if (options.filterOwnGoals) {
      filters.push(eq(goalEvents.isOwnGoal, false));
    }

    if (options.filterGoalkeepers) {
      filters.push(eq(players.isGoalkeeper, false));
    }

    if (validSeasonId) {
      filters.push(eq(matches.seasonId, validSeasonId));
    }

    filters.push(gte(matches.matchDate, MODERN_START_DATE));

      return db
        .select({
          playerId: players.id,
          playerName: players.name,
          assists: assistsCount.as("assists"),
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(and(...filters))
        .groupBy(players.id, players.name)
        .orderBy(desc(assistsCount), asc(players.name));
  };

  let topAssists: Array<{ playerId: number; playerName: string; assists: number }> = [];
  let assistConnections: Array<{ assistPlayerId: number | null; scorerPlayerId: number }> = [];
  let gamesByPlayer = new Map<number, number>();

  try {
    topAssists = await queryTopAssists({ filterOwnGoals: true, filterGoalkeepers: true });
  } catch (error) {
    if (isMissingColumnError(error, "is_own_goal")) {
      ownGoalColumnAvailable = false;
      try {
        topAssists = await queryTopAssists({ filterOwnGoals: false, filterGoalkeepers: true });
      } catch (fallbackError) {
        if (!isMissingColumnError(fallbackError, "is_goalkeeper")) {
          throw fallbackError;
        }

        goalkeeperColumnAvailable = false;
        topAssists = await queryTopAssists({ filterOwnGoals: false, filterGoalkeepers: false });
      }
    } else if (isMissingColumnError(error, "is_goalkeeper")) {
      goalkeeperColumnAvailable = false;
      try {
        topAssists = await queryTopAssists({ filterOwnGoals: true, filterGoalkeepers: false });
      } catch (fallbackError) {
        if (!isMissingColumnError(fallbackError, "is_own_goal")) {
          throw fallbackError;
        }

        ownGoalColumnAvailable = false;
        topAssists = await queryTopAssists({ filterOwnGoals: false, filterGoalkeepers: false });
      }
    } else {
      throw error;
    }
  }

  const queryAssistConnections = async (options: { filterOwnGoals: boolean; filterGoalkeepers: boolean }) => {
    const filters = [isNotNull(goalEvents.assistPlayerId)];

    if (options.filterOwnGoals) {
      filters.push(eq(goalEvents.isOwnGoal, false));
    }

    if (options.filterGoalkeepers) {
      filters.push(eq(players.isGoalkeeper, false));
    }

    if (validSeasonId) {
      filters.push(eq(matches.seasonId, validSeasonId));
    }

    filters.push(gte(matches.matchDate, MODERN_START_DATE));

    return db
      .select({
        assistPlayerId: goalEvents.assistPlayerId,
        scorerPlayerId: goalEvents.scorerPlayerId,
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
      .innerJoin(matches, eq(goalEvents.matchId, matches.id))
      .where(and(...filters));
  };

  try {
    assistConnections = await queryAssistConnections({
      filterOwnGoals: ownGoalColumnAvailable,
      filterGoalkeepers: goalkeeperColumnAvailable,
    });
  } catch {
    assistConnections = [];
  }

  const playerIds = topAssists.map((entry) => entry.playerId);

  if (playerIds.length > 0) {
    const gamesRows = validSeasonId
      ? await db
          .select({
            playerId: players.id,
            games: sql<number>`count(${matchParticipantPrimary.id})`,
          })
          .from(matchParticipantPrimary)
          .innerJoin(players, eq(matchParticipantPrimary.playerId, players.id))
          .innerJoin(matches, eq(matchParticipantPrimary.matchId, matches.id))
          .where(and(eq(matches.seasonId, validSeasonId), gte(matches.matchDate, MODERN_START_DATE)))
          .groupBy(players.id)
      : await db
          .select({
            playerId: players.id,
            games: sql<number>`count(${matchParticipantPrimary.id})`,
          })
          .from(matchParticipantPrimary)
          .innerJoin(players, eq(matchParticipantPrimary.playerId, players.id))
          .innerJoin(matches, eq(matchParticipantPrimary.matchId, matches.id))
          .where(gte(matches.matchDate, MODERN_START_DATE))
          .groupBy(players.id);

    gamesByPlayer = new Map(gamesRows.map((row) => [row.playerId, Number(row.games) || 0]));
  }

  const scorerIds = Array.from(new Set(assistConnections.map((entry) => entry.scorerPlayerId)));
  const scorerRows =
    scorerIds.length > 0
      ? await db
          .select({
            id: players.id,
            name: players.name,
          })
          .from(players)
          .where(inArray(players.id, scorerIds))
      : [];
  const scorerNameById = new Map(scorerRows.map((row) => [row.id, row.name]));

  const topScorerByAssistPlayer = new Map<number, { scorerPlayerId: number; scorerName: string; count: number }>();
  const pairCounts = new Map<string, number>();

  for (const connection of assistConnections) {
    if (!connection.assistPlayerId) {
      continue;
    }

    const pairKey = `${connection.assistPlayerId}-${connection.scorerPlayerId}`;
    const nextCount = (pairCounts.get(pairKey) ?? 0) + 1;
    pairCounts.set(pairKey, nextCount);

    const currentBest = topScorerByAssistPlayer.get(connection.assistPlayerId);
    const scorerName = scorerNameById.get(connection.scorerPlayerId) ?? `Spieler #${connection.scorerPlayerId}`;

    if (!currentBest || nextCount > currentBest.count || (nextCount === currentBest.count && scorerName.localeCompare(currentBest.scorerName, "de") < 0)) {
      topScorerByAssistPlayer.set(connection.assistPlayerId, {
        scorerPlayerId: connection.scorerPlayerId,
        scorerName,
        count: nextCount,
      });
    }
  }

  const rows = topAssists.map((entry) => {
    const games = gamesByPlayer.get(entry.playerId) ?? 0;
    const topScorerConnection = topScorerByAssistPlayer.get(entry.playerId);

    return {
      ...entry,
      games,
      assistsPerGame: games > 0 ? entry.assists / games : 0,
      topScorerName: topScorerConnection?.scorerName ?? "-",
      topScorerCount: topScorerConnection?.count ?? 0,
      topScorerPlayerId: topScorerConnection?.scorerPlayerId ?? null,
    };
  });

  const sortedTopAssists = [...rows].sort((a, b) => {
    if (sortKey === "player") {
      const byName = a.playerName.localeCompare(b.playerName, "de");
      if (byName !== 0) {
        return sortDir === "asc" ? byName : -byName;
      }

      return b.assists - a.assists;
    }

    if (sortKey === "assistsPerGame") {
      if (a.assistsPerGame !== b.assistsPerGame) {
        return sortDir === "asc" ? a.assistsPerGame - b.assistsPerGame : b.assistsPerGame - a.assistsPerGame;
      }

      return b.assists - a.assists;
    }

    if (a.assists !== b.assists) {
      return sortDir === "asc" ? a.assists - b.assists : b.assists - a.assists;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const buildSortHref = (column: "player" | "assists" | "assistsPerGame") => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();

    if (validSeasonId) {
      query.set("seasonId", String(validSeasonId));
    }

    query.set("sort", column);
    query.set("dir", nextDir);

    return `?${query.toString()}`;
  };

  const sortArrow = (column: "player" | "assists" | "assistsPerGame") => {
    if (sortKey !== column) {
      return "↕";
    }

    return sortDir === "asc" ? "↑" : "↓";
  };

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

      {!ownGoalColumnAvailable ? (
        <p className="mb-4 text-sm text-amber-300">
          Eigentor-Daten sind in dieser Datenbank noch nicht verfügbar (Migration fehlt). Top-Assists wird ohne Eigentor-Filter berechnet.
        </p>
      ) : null}

      {!goalkeeperColumnAvailable ? (
        <p className="mb-4 text-sm text-amber-300">
          Torwart-Kennzeichnung ist in dieser Datenbank noch nicht verfügbar (Migration fehlt). Top-Assists wird ohne Torwart-Filter berechnet.
        </p>
      ) : null}

      {topAssists.length === 0 ? (
        <p className="text-zinc-500">Noch keine Assists erfasst.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-300">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("player")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Spieler <span className="text-xs">{sortArrow("player")}</span>
                </Link>
              </th>
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("assists")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Assists <span className="text-xs">{sortArrow("assists")}</span>
                </Link>
              </th>
              <th className="px-4 py-3 text-left">
                <Link href={buildSortHref("assistsPerGame")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Assists/Spiel <span className="text-xs">{sortArrow("assistsPerGame")}</span>
                </Link>
              </th>
              <th className="px-4 py-3 text-left">Häufigster Abnehmer</th>
            </tr>
          </thead>
          <tbody>
            {sortedTopAssists.map((entry) => (
              <tr key={entry.playerId} className="border-t border-zinc-300">
                <td className="px-4 py-3">
                  <Link href={`/admin/players/${entry.playerId}`} className="hover:underline">
                    {entry.playerName}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold text-red-300">{entry.assists}</td>
                <td className="px-4 py-3">{entry.assistsPerGame.toFixed(2)}</td>
                <td className="px-4 py-3">
                  {entry.topScorerName !== "-" ? (
                    <>
                      <Link href={`/admin/players/${entry.topScorerPlayerId}`} className="hover:underline">
                        {entry.topScorerName}
                      </Link>{" "}
                      ({entry.topScorerCount})
                    </>
                  ) : "-"}
                </td>
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