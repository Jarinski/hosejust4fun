import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

type ComebackImpactPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

type GoalRow = {
  id: number;
  matchId: number;
  teamSide: "team_1" | "team_2";
  scorerPlayerId: number;
  scorerName: string;
  minute: number | null;
  createdAt: Date | null;
};

type ComebackEntry = {
  playerId: number;
  playerName: string;
  comebackGoals: number;
  lateComebackGoals: number;
};

export default async function ComebackImpactPage({ searchParams }: ComebackImpactPageProps) {
  const allSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
    })
    .from(seasons)
    .orderBy(desc(seasons.startDate), desc(seasons.id));

  const params = await searchParams;
  const seasonIdParam = Array.isArray(params.seasonId) ? params.seasonId[0] : params.seasonId;

  const parsedSeasonId = Number(seasonIdParam);
  const selectedSeason =
    seasonIdParam !== undefined && seasonIdParam !== "" && Number.isInteger(parsedSeasonId)
      ? allSeasons.find((season) => season.id === parsedSeasonId) ?? null
      : null;

  const validSeasonId = selectedSeason?.id;

  const rawGoals: GoalRow[] = validSeasonId
    ? await db
        .select({
          id: goalEvents.id,
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: players.name,
          minute: goalEvents.minute,
          createdAt: goalEvents.createdAt,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
        .orderBy(asc(goalEvents.matchId), asc(goalEvents.minute), asc(goalEvents.createdAt), asc(goalEvents.id))
    : await db
        .select({
          id: goalEvents.id,
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: players.name,
          minute: goalEvents.minute,
          createdAt: goalEvents.createdAt,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
        .orderBy(asc(goalEvents.matchId), asc(goalEvents.minute), asc(goalEvents.createdAt), asc(goalEvents.id));

  const goals = [...rawGoals].sort((a, b) => {
    if (a.matchId !== b.matchId) {
      return a.matchId - b.matchId;
    }

    const minuteA = a.minute;
    const minuteB = b.minute;

    if (minuteA === null && minuteB !== null) {
      return 1;
    }

    if (minuteA !== null && minuteB === null) {
      return -1;
    }

    if (minuteA !== null && minuteB !== null && minuteA !== minuteB) {
      return minuteA - minuteB;
    }

    const createdAtA = a.createdAt ? a.createdAt.getTime() : 0;
    const createdAtB = b.createdAt ? b.createdAt.getTime() : 0;

    if (createdAtA !== createdAtB) {
      return createdAtA - createdAtB;
    }

    return a.id - b.id;
  });

  const comebackMap = new Map<number, ComebackEntry>();

  let currentMatchId: number | null = null;
  let team1Score = 0;
  let team2Score = 0;

  for (const goal of goals) {
    if (goal.matchId !== currentMatchId) {
      currentMatchId = goal.matchId;
      team1Score = 0;
      team2Score = 0;
    }

    const scorerWasTrailing =
      goal.teamSide === "team_1" ? team1Score < team2Score : team2Score < team1Score;

    if (scorerWasTrailing) {
      const current =
        comebackMap.get(goal.scorerPlayerId) ?? {
          playerId: goal.scorerPlayerId,
          playerName: goal.scorerName,
          comebackGoals: 0,
          lateComebackGoals: 0,
        };

      current.comebackGoals += 1;
      if (goal.minute !== null && goal.minute >= 75) {
        current.lateComebackGoals += 1;
      }

      comebackMap.set(goal.scorerPlayerId, current);
    }

    if (goal.teamSide === "team_1") {
      team1Score += 1;
    } else {
      team2Score += 1;
    }
  }

  const rows = Array.from(comebackMap.values()).sort((a, b) => {
    if (b.comebackGoals !== a.comebackGoals) {
      return b.comebackGoals - a.comebackGoals;
    }

    if (b.lateComebackGoals !== a.lateComebackGoals) {
      return b.lateComebackGoals - a.lateComebackGoals;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/stats" className="hover:text-zinc-900">
            ← Zurück zu Statistiken
          </Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Comeback Impact</h1>

        <form method="GET" className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="seasonId" className="text-sm text-zinc-600">
            Saison:
          </label>
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
          <p className="mb-4 text-sm text-amber-300">
            Ungültige Saison gewählt. Es werden alle Saisons angezeigt.
          </p>
        ) : null}

        {goals.length === 0 ? (
          <p className="text-zinc-500">Noch keine Tore erfasst.</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500">Noch keine Comeback Goals erfasst.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-300">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 text-left">Spielername</th>
                  <th className="px-4 py-3 text-left">Comeback Goals</th>
                  <th className="px-4 py-3 text-left">Late Comeback Goals (ab 75.)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry, index) => (
                  <tr key={entry.playerId} className="border-t border-zinc-300">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{entry.playerName}</span>
                        {index === 0 && entry.comebackGoals > 0 ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            🔥 Comeback Player
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-300">{entry.comebackGoals}</td>
                    <td className="px-4 py-3">{entry.lateComebackGoals}</td>
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