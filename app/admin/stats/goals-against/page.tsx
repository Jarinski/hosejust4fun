import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players, seasons } from "@/src/db/schema";

type GoalsAgainstPageProps = {
  searchParams: Promise<{
    seasonId?: string | string[];
    playerSort?: string | string[];
    playerDir?: string | string[];
    duoSort?: string | string[];
    duoDir?: string | string[];
  }>;
};

type PlayerAgainstStats = {
  playerId: number;
  games: number;
  goalsAgainst: number;
};

type DuoAgainstStats = {
  player1Id: number;
  player2Id: number;
  games: number;
  goalsAgainst: number;
};

export default async function GoalsAgainstPage({ searchParams }: GoalsAgainstPageProps) {
  const allSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
    })
    .from(seasons)
    .orderBy(desc(seasons.startDate), desc(seasons.id));

  const params = await searchParams;
  const seasonIdParam = Array.isArray(params.seasonId) ? params.seasonId[0] : params.seasonId;
  const playerSortParam = Array.isArray(params.playerSort) ? params.playerSort[0] : params.playerSort;
  const playerDirParam = Array.isArray(params.playerDir) ? params.playerDir[0] : params.playerDir;
  const duoSortParam = Array.isArray(params.duoSort) ? params.duoSort[0] : params.duoSort;
  const duoDirParam = Array.isArray(params.duoDir) ? params.duoDir[0] : params.duoDir;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;
  const playerSortKey =
    playerSortParam === "player" ||
    playerSortParam === "games" ||
    playerSortParam === "goalsAgainst" ||
    playerSortParam === "avg"
      ? playerSortParam
      : "avg";
  const playerSortDir = playerDirParam === "asc" ? "asc" : "desc";
  const duoSortKey =
    duoSortParam === "player1" ||
    duoSortParam === "player2" ||
    duoSortParam === "games" ||
    duoSortParam === "goalsAgainst" ||
    duoSortParam === "avg"
      ? duoSortParam
      : "avg";
  const duoSortDir = duoDirParam === "asc" ? "asc" : "desc";

  const participantsPromise = validSeasonId
    ? db
        .select({
          matchId: matchParticipants.matchId,
          playerId: matchParticipants.playerId,
          teamSide: matchParticipants.teamSide,
        })
        .from(matchParticipants)
        .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
    : db
        .select({
          matchId: matchParticipants.matchId,
          playerId: matchParticipants.playerId,
          teamSide: matchParticipants.teamSide,
        })
        .from(matchParticipants);

  const goalsPromise = validSeasonId
    ? db
        .select({
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
        })
        .from(goalEvents)
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
    : db
        .select({
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
        })
        .from(goalEvents);

  const [participants, goals] = await Promise.all([participantsPromise, goalsPromise]);

  const filterUi = (
    <>
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
    </>
  );

  if (participants.length === 0) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
          <p className="mb-4 text-sm text-zinc-600">
            <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
          </p>

          <h1 className="mb-4 text-2xl font-semibold">Gegentor-Statistik</h1>
          {filterUi}
          <p className="text-zinc-500">Noch keine Teilnehmerdaten erfasst.</p>
        </section>
      </main>
    );
  }

  const goalsByMatchTeam = new Map<string, number>();
  for (const goal of goals) {
    const key = `${goal.matchId}-${goal.teamSide}`;
    goalsByMatchTeam.set(key, (goalsByMatchTeam.get(key) ?? 0) + 1);
  }

  const teamsByMatch = new Map<string, Set<number>>();
  for (const participant of participants) {
    const key = `${participant.matchId}-${participant.teamSide}`;
    const set = teamsByMatch.get(key) ?? new Set<number>();
    set.add(participant.playerId);
    teamsByMatch.set(key, set);
  }

  const playerStats = new Map<number, PlayerAgainstStats>();
  const duoStats = new Map<string, DuoAgainstStats>();

  for (const [teamKey, teamPlayersSet] of teamsByMatch.entries()) {
    const [matchIdRaw, teamSide] = teamKey.split("-");
    const matchId = Number(matchIdRaw);
    const opponentSide = teamSide === "team_1" ? "team_2" : "team_1";
    const conceded = goalsByMatchTeam.get(`${matchId}-${opponentSide}`) ?? 0;

    const teamPlayers = Array.from(teamPlayersSet).sort((a, b) => a - b);

    for (const playerId of teamPlayers) {
      const current = playerStats.get(playerId) ?? { playerId, games: 0, goalsAgainst: 0 };
      current.games += 1;
      current.goalsAgainst += conceded;
      playerStats.set(playerId, current);
    }

    for (let i = 0; i < teamPlayers.length - 1; i++) {
      for (let j = i + 1; j < teamPlayers.length; j++) {
        const player1Id = teamPlayers[i];
        const player2Id = teamPlayers[j];
        const duoKey = `${player1Id}-${player2Id}`;

        const current = duoStats.get(duoKey) ?? {
          player1Id,
          player2Id,
          games: 0,
          goalsAgainst: 0,
        };

        current.games += 1;
        current.goalsAgainst += conceded;
        duoStats.set(duoKey, current);
      }
    }
  }

  const playerIds = Array.from(
    new Set([
      ...Array.from(playerStats.values()).map((entry) => entry.playerId),
      ...Array.from(duoStats.values()).flatMap((entry) => [entry.player1Id, entry.player2Id]),
    ]),
  );

  const playerNameRows = playerIds.length
    ? await db
        .select({
          id: players.id,
          name: players.name,
        })
        .from(players)
        .where(inArray(players.id, playerIds))
    : [];

  const playerNameById = new Map(playerNameRows.map((player) => [player.id, player.name]));

  const playerRows = Array.from(playerStats.values())
    .map((entry) => ({
      ...entry,
      playerName: playerNameById.get(entry.playerId) ?? `Spieler #${entry.playerId}`,
      goalsAgainstPerGame: entry.games > 0 ? (entry.goalsAgainst / entry.games).toFixed(2) : "0.00",
    }));

  const playerRowsSorted = [...playerRows].sort((a, b) => {
    if (playerSortKey === "player") {
      const byName = a.playerName.localeCompare(b.playerName, "de");
      if (byName !== 0) {
        return playerSortDir === "asc" ? byName : -byName;
      }

      return b.goalsAgainst - a.goalsAgainst;
    }

    if (playerSortKey === "games") {
      if (a.games !== b.games) {
        return playerSortDir === "asc" ? a.games - b.games : b.games - a.games;
      }

      return b.goalsAgainst - a.goalsAgainst;
    }

    if (playerSortKey === "goalsAgainst") {
      if (a.goalsAgainst !== b.goalsAgainst) {
        return playerSortDir === "asc"
          ? a.goalsAgainst - b.goalsAgainst
          : b.goalsAgainst - a.goalsAgainst;
      }

      return b.games - a.games;
    }

    const avgDiff = Number(a.goalsAgainstPerGame) - Number(b.goalsAgainstPerGame);
    if (avgDiff !== 0) {
      return playerSortDir === "asc" ? avgDiff : -avgDiff;
    }

    if (b.goalsAgainst !== a.goalsAgainst) {
      return b.goalsAgainst - a.goalsAgainst;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  const duoRows = Array.from(duoStats.values())
    .map((entry) => ({
      ...entry,
      player1Name: playerNameById.get(entry.player1Id) ?? `Spieler #${entry.player1Id}`,
      player2Name: playerNameById.get(entry.player2Id) ?? `Spieler #${entry.player2Id}`,
      goalsAgainstPerGame: entry.games > 0 ? (entry.goalsAgainst / entry.games).toFixed(2) : "0.00",
    }));

  const duoRowsSorted = [...duoRows].sort((a, b) => {
    if (duoSortKey === "player1") {
      const byName = a.player1Name.localeCompare(b.player1Name, "de");
      if (byName !== 0) {
        return duoSortDir === "asc" ? byName : -byName;
      }

      return b.goalsAgainst - a.goalsAgainst;
    }

    if (duoSortKey === "player2") {
      const byName = a.player2Name.localeCompare(b.player2Name, "de");
      if (byName !== 0) {
        return duoSortDir === "asc" ? byName : -byName;
      }

      return b.goalsAgainst - a.goalsAgainst;
    }

    if (duoSortKey === "games") {
      if (a.games !== b.games) {
        return duoSortDir === "asc" ? a.games - b.games : b.games - a.games;
      }

      return b.goalsAgainst - a.goalsAgainst;
    }

    if (duoSortKey === "goalsAgainst") {
      if (a.goalsAgainst !== b.goalsAgainst) {
        return duoSortDir === "asc"
          ? a.goalsAgainst - b.goalsAgainst
          : b.goalsAgainst - a.goalsAgainst;
      }

      return b.games - a.games;
    }

    const avgDiff = Number(a.goalsAgainstPerGame) - Number(b.goalsAgainstPerGame);
    if (avgDiff !== 0) {
      return duoSortDir === "asc" ? avgDiff : -avgDiff;
    }

    if (b.goalsAgainst !== a.goalsAgainst) {
      return b.goalsAgainst - a.goalsAgainst;
    }

    const byPlayer1 = a.player1Name.localeCompare(b.player1Name, "de");
    if (byPlayer1 !== 0) {
      return byPlayer1;
    }

    return a.player2Name.localeCompare(b.player2Name, "de");
  });

  const buildSortHref = (
    table: "player" | "duo",
    column: "player" | "games" | "goalsAgainst" | "avg" | "player1" | "player2",
  ) => {
    const query = new URLSearchParams();
    if (validSeasonId) {
      query.set("seasonId", String(validSeasonId));
    }

    query.set("playerSort", playerSortKey);
    query.set("playerDir", playerSortDir);
    query.set("duoSort", duoSortKey);
    query.set("duoDir", duoSortDir);

    if (table === "player") {
      const nextDir = playerSortKey === column && playerSortDir === "desc" ? "asc" : "desc";
      query.set("playerSort", String(column));
      query.set("playerDir", nextDir);
    } else {
      const nextDir = duoSortKey === column && duoSortDir === "desc" ? "asc" : "desc";
      query.set("duoSort", String(column));
      query.set("duoDir", nextDir);
    }

    return `?${query.toString()}`;
  };

  const sortArrow = (
    table: "player" | "duo",
    column: "player" | "games" | "goalsAgainst" | "avg" | "player1" | "player2",
  ) => {
    const active = table === "player" ? playerSortKey === column : duoSortKey === column;
    if (!active) {
      return "↕";
    }

    const dir = table === "player" ? playerSortDir : duoSortDir;
    return dir === "asc" ? "↑" : "↓";
  };

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Gegentor-Statistik</h1>
        {filterUi}

        <h2 className="mb-3 mt-2 text-lg font-medium">Meiste Gegentore pro Spiel (Spieler)</h2>
        {playerRowsSorted.length === 0 ? (
          <p className="mb-8 text-zinc-500">Keine Daten vorhanden.</p>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-xl border border-zinc-300">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("player", "player")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler <span className="text-xs">{sortArrow("player", "player")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("player", "games")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spiele <span className="text-xs">{sortArrow("player", "games")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("player", "goalsAgainst")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gegentore <span className="text-xs">{sortArrow("player", "goalsAgainst")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("player", "avg")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gegentore / Spiel <span className="text-xs">{sortArrow("player", "avg")}</span></Link></th>
                </tr>
              </thead>
              <tbody>
                {playerRowsSorted.map((entry) => (
                  <tr key={entry.playerId} className="border-t border-zinc-300">
                    <td className="px-4 py-3">{entry.playerName}</td>
                    <td className="px-4 py-3">{entry.games}</td>
                    <td className="px-4 py-3">{entry.goalsAgainst}</td>
                    <td className="px-4 py-3 font-semibold text-red-300">{entry.goalsAgainstPerGame}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="mb-3 text-lg font-medium">Mit wem fallen die meisten Gegentore? (Duo im Team)</h2>
        {duoRowsSorted.length === 0 ? (
          <p className="text-zinc-500">Keine Duo-Daten vorhanden.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-300">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("duo", "player1")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler 1 <span className="text-xs">{sortArrow("duo", "player1")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("duo", "player2")} className="inline-flex items-center gap-1 hover:text-zinc-900">Spieler 2 <span className="text-xs">{sortArrow("duo", "player2")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("duo", "games")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gemeinsame Spiele <span className="text-xs">{sortArrow("duo", "games")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("duo", "goalsAgainst")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gegentore zusammen <span className="text-xs">{sortArrow("duo", "goalsAgainst")}</span></Link></th>
                  <th className="px-4 py-3 text-left"><Link href={buildSortHref("duo", "avg")} className="inline-flex items-center gap-1 hover:text-zinc-900">Gegentore / Spiel <span className="text-xs">{sortArrow("duo", "avg")}</span></Link></th>
                </tr>
              </thead>
              <tbody>
                {duoRowsSorted.map((entry) => (
                  <tr key={`${entry.player1Id}-${entry.player2Id}`} className="border-t border-zinc-300">
                    <td className="px-4 py-3">{entry.player1Name}</td>
                    <td className="px-4 py-3">{entry.player2Name}</td>
                    <td className="px-4 py-3">{entry.games}</td>
                    <td className="px-4 py-3">{entry.goalsAgainst}</td>
                    <td className="px-4 py-3 font-semibold text-red-300">{entry.goalsAgainstPerGame}</td>
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
