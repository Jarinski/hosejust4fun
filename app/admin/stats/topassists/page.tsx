import Link from "next/link";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

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
  const sortKey = sortParam === "player" || sortParam === "assists" ? sortParam : "assists";
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
    }

    return db
      .select({
        playerId: players.id,
        playerName: players.name,
        assists: assistsCount.as("assists"),
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
      .where(and(...filters))
      .groupBy(players.id, players.name)
      .orderBy(desc(assistsCount), asc(players.name));
  };

  let topAssists: Array<{ playerId: number; playerName: string; assists: number }> = [];

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

  const sortedTopAssists = [...topAssists].sort((a, b) => {
    if (sortKey === "player") {
      const byName = a.playerName.localeCompare(b.playerName, "de");
      if (byName !== 0) {
        return sortDir === "asc" ? byName : -byName;
      }

      return b.assists - a.assists;
    }

    if (a.assists !== b.assists) {
      return sortDir === "asc" ? a.assists - b.assists : b.assists - a.assists;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const buildSortHref = (column: "player" | "assists") => {
    const nextDir = sortKey === column && sortDir === "desc" ? "asc" : "desc";
    const query = new URLSearchParams();

    if (validSeasonId) {
      query.set("seasonId", String(validSeasonId));
    }

    query.set("sort", column);
    query.set("dir", nextDir);

    return `?${query.toString()}`;
  };

  const sortArrow = (column: "player" | "assists") => {
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
            </tr>
          </thead>
          <tbody>
            {sortedTopAssists.map((entry) => (
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