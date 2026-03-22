import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matches, players, seasons } from "@/src/db/schema";

type GoalMomentsPageProps = {
  searchParams: Promise<{ seasonId?: string | string[] }>;
};

type CounterEntry = {
  playerId: number;
  playerName: string;
  count: number;
};

type GoalRow = {
  id: number;
  matchId: number;
  teamSide: "team_1" | "team_2";
  isOwnGoal: boolean;
  scorerPlayerId: number;
  scorerName: string;
  minute: number | null;
};

function incrementCounter(
  map: Map<number, CounterEntry>,
  playerId: number,
  playerName: string,
) {
  const current = map.get(playerId) ?? { playerId, playerName, count: 0 };
  current.count += 1;
  map.set(playerId, current);
}

function sortCounterEntries(entries: CounterEntry[]) {
  return entries.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.playerName.localeCompare(b.playerName, "de");
  });
}

function StatsTable({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: CounterEntry[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-300">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left">Spieler</th>
                <th className="px-4 py-3 text-left">Anzahl</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.playerId} className="border-t border-zinc-300">
                  <td className="px-4 py-3">{entry.playerName}</td>
                  <td className="px-4 py-3 font-semibold text-red-300">{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function GoalMomentsPage({ searchParams }: GoalMomentsPageProps) {
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
          isOwnGoal: goalEvents.isOwnGoal,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: players.name,
          minute: goalEvents.minute,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
        .innerJoin(matches, eq(goalEvents.matchId, matches.id))
        .where(eq(matches.seasonId, validSeasonId))
        .orderBy(asc(goalEvents.matchId), asc(goalEvents.id))
    : await db
        .select({
          id: goalEvents.id,
          matchId: goalEvents.matchId,
          teamSide: goalEvents.teamSide,
          isOwnGoal: goalEvents.isOwnGoal,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: players.name,
          minute: goalEvents.minute,
        })
        .from(goalEvents)
        .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
        .orderBy(asc(goalEvents.matchId), asc(goalEvents.id));

  const goals = [...rawGoals].sort((a, b) => {
    if (a.matchId !== b.matchId) {
      return a.matchId - b.matchId;
    }

    const minuteA = a.minute ?? 999;
    const minuteB = b.minute ?? 999;
    if (minuteA !== minuteB) {
      return minuteA - minuteB;
    }

    return a.id - b.id;
  });

  const firstGoalCounter = new Map<number, CounterEntry>();
  const equalizerCounter = new Map<number, CounterEntry>();
  const earlyGoalCounter = new Map<number, CounterEntry>();
  const lateGoalCounter = new Map<number, CounterEntry>();

  let currentMatchId: number | null = null;
  let team1Score = 0;
  let team2Score = 0;

  for (const goal of goals) {
    if (goal.matchId !== currentMatchId) {
      currentMatchId = goal.matchId;
      team1Score = 0;
      team2Score = 0;
    }

    const wasNilNil = team1Score === 0 && team2Score === 0;

    if (goal.teamSide === "team_1") {
      team1Score += 1;
    } else {
      team2Score += 1;
    }

    if (goal.isOwnGoal) {
      continue;
    }

    if (wasNilNil) {
      incrementCounter(firstGoalCounter, goal.scorerPlayerId, goal.scorerName);
    }

    if (team1Score === team2Score) {
      incrementCounter(equalizerCounter, goal.scorerPlayerId, goal.scorerName);
    }

    if (goal.minute !== null && goal.minute >= 0 && goal.minute <= 15) {
      incrementCounter(earlyGoalCounter, goal.scorerPlayerId, goal.scorerName);
    }

    if (goal.minute !== null && goal.minute >= 76) {
      incrementCounter(lateGoalCounter, goal.scorerPlayerId, goal.scorerName);
    }
  }

  const firstGoals = sortCounterEntries(Array.from(firstGoalCounter.values()));
  const equalizers = sortCounterEntries(Array.from(equalizerCounter.values()));
  const earlyGoals = sortCounterEntries(Array.from(earlyGoalCounter.values()));
  const lateGoals = sortCounterEntries(Array.from(lateGoalCounter.values()));

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">← Zurück zu Matches</Link>
        </p>

        <h1 className="mb-4 text-2xl font-semibold">Tor-Momente</h1>

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

        {goals.length === 0 ? (
          <p className="text-zinc-500">Noch keine Tore erfasst.</p>
        ) : (
          <div className="space-y-8">
            <StatsTable
              title="Wer erzielt am häufigsten das 1:0?"
              emptyLabel="Kein 1:0-Torschütze erfasst."
              rows={firstGoals}
            />

            <StatsTable
              title="Wer erzielt am häufigsten den Ausgleich?"
              emptyLabel="Kein Ausgleichstreffer erfasst."
              rows={equalizers}
            />

            <StatsTable
              title="Wer trifft häufig in den ersten 15 Minuten?"
              emptyLabel="Keine Treffer in den ersten 15 Minuten erfasst."
              rows={earlyGoals}
            />

            <StatsTable
              title="Wer trifft häufig in den letzten 15 Minuten?"
              emptyLabel="Keine Treffer in den letzten 15 Minuten erfasst."
              rows={lateGoals}
            />
          </div>
        )}
      </section>
    </main>
  );
}