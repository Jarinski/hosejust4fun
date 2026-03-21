import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  matchParticipants,
  matches,
  matchWeather,
  players,
} from "@/src/db/schema";
import { isRainLikeWeather, isSunnyLikeWeather } from "@/src/lib/weatherIcons";

type WeatherMatchRow = {
  matchId: number;
  temperatureC: number | null;
  precipMm: number | null;
  conditionLabel: string | null;
  mvpPlayerId: number | null;
};

type ParticipantRow = {
  matchId: number;
  playerId: number;
};

type GoalRow = {
  matchId: number;
  scorerPlayerId: number;
  assistPlayerId: number | null;
  isOwnGoal: boolean;
};

async function loadGoalsForMatches(matchIds: number[]): Promise<GoalRow[]> {
  if (matchIds.length === 0) {
    return [];
  }

  try {
    return await db
      .select({
        matchId: goalEvents.matchId,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
        isOwnGoal: goalEvents.isOwnGoal,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds));
  } catch {
    // Fallback for databases where the own-goal migration has not yet been applied.
    const legacyGoals = await db
      .select({
        matchId: goalEvents.matchId,
        scorerPlayerId: goalEvents.scorerPlayerId,
        assistPlayerId: goalEvents.assistPlayerId,
      })
      .from(goalEvents)
      .where(inArray(goalEvents.matchId, matchIds));

    return legacyGoals.map((goal) => ({ ...goal, isOwnGoal: false }));
  }
}

type RankingRow = {
  playerId: number;
  playerName: string;
  value: number;
  games: number;
  perGame: string;
};

function isRainMatch(match: WeatherMatchRow) {
  return isRainLikeWeather({
    conditionLabel: match.conditionLabel,
    precipMm: match.precipMm,
  });
}

function countGamesByPlayer(participants: ParticipantRow[]) {
  const gameKeySet = new Set<string>();
  const gamesByPlayer = new Map<number, number>();

  for (const participant of participants) {
    const gameKey = `${participant.playerId}-${participant.matchId}`;
    if (gameKeySet.has(gameKey)) {
      continue;
    }

    gameKeySet.add(gameKey);
    gamesByPlayer.set(participant.playerId, (gamesByPlayer.get(participant.playerId) ?? 0) + 1);
  }

  return gamesByPlayer;
}

function mapToSortedRankingRows(
  valuesByPlayer: Map<number, number>,
  gamesByPlayer: Map<number, number>,
  playerNameById: Map<number, string>,
) {
  const rows: RankingRow[] = Array.from(valuesByPlayer.entries()).map(([playerId, value]) => {
    const games = gamesByPlayer.get(playerId) ?? 0;
    return {
      playerId,
      playerName: playerNameById.get(playerId) ?? `Spieler #${playerId}`,
      value,
      games,
      perGame: games > 0 ? (value / games).toFixed(2) : "0.00",
    };
  });

  return rows.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if (b.games !== a.games) return b.games - a.games;
    return a.playerName.localeCompare(b.playerName, "de");
  });
}

function RankingCard({
  title,
  subtitle,
  valueLabel,
  rows,
}: {
  title: string;
  subtitle: string;
  valueLabel: string;
  rows: RankingRow[];
}) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
      <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Keine passenden Daten vorhanden.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.playerId}
              className="grid grid-cols-[auto,1fr,auto] items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/70 px-3 py-3"
            >
              <span className="text-sm font-semibold text-zinc-300">#{index + 1}</span>

              <div>
                <p className="font-medium text-zinc-100">{row.playerName}</p>
                <p className="text-xs text-zinc-400">{row.games} Spiele unter diesen Bedingungen</p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-red-300">
                  {row.value} {valueLabel}
                </p>
                <p className="text-xs text-zinc-400">{row.perGame} / Spiel</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

export default async function WeatherStatsPage() {
  const weatherMatches = await db
    .select({
      matchId: matchWeather.matchId,
      temperatureC: matchWeather.temperatureC,
      precipMm: matchWeather.precipMm,
      conditionLabel: matchWeather.conditionLabel,
      mvpPlayerId: matches.mvpPlayerId,
    })
    .from(matchWeather)
    .innerJoin(matches, eq(matchWeather.matchId, matches.id));

  const coldMatchIds = weatherMatches
    .filter((match) => match.temperatureC !== null && match.temperatureC < 10)
    .map((match) => match.matchId);

  const rainMatchIds = weatherMatches.filter(isRainMatch).map((match) => match.matchId);

  const badWeatherMatchIds = weatherMatches
    .filter((match) => isRainMatch(match) || (match.temperatureC !== null && match.temperatureC < 10))
    .map((match) => match.matchId);

  const sunnyMatchIds = weatherMatches
    .filter(
      (match) =>
        isSunnyLikeWeather({
          conditionLabel: match.conditionLabel,
          precipMm: match.precipMm,
          temperatureC: match.temperatureC,
        }),
    )
    .map((match) => match.matchId);

  const [
    coldParticipants,
    rainParticipants,
    badWeatherParticipants,
    sunnyParticipants,
    coldGoals,
    rainGoals,
    sunnyGoals,
  ] =
    await Promise.all([
      coldMatchIds.length
        ? db
            .select({
              matchId: matchParticipants.matchId,
              playerId: matchParticipants.playerId,
            })
            .from(matchParticipants)
            .where(inArray(matchParticipants.matchId, coldMatchIds))
        : Promise.resolve([] as ParticipantRow[]),
      rainMatchIds.length
        ? db
            .select({
              matchId: matchParticipants.matchId,
              playerId: matchParticipants.playerId,
            })
            .from(matchParticipants)
            .where(inArray(matchParticipants.matchId, rainMatchIds))
        : Promise.resolve([] as ParticipantRow[]),
      badWeatherMatchIds.length
        ? db
            .select({
              matchId: matchParticipants.matchId,
              playerId: matchParticipants.playerId,
            })
            .from(matchParticipants)
            .where(inArray(matchParticipants.matchId, badWeatherMatchIds))
        : Promise.resolve([] as ParticipantRow[]),
      sunnyMatchIds.length
        ? db
            .select({
              matchId: matchParticipants.matchId,
              playerId: matchParticipants.playerId,
            })
            .from(matchParticipants)
            .where(inArray(matchParticipants.matchId, sunnyMatchIds))
        : Promise.resolve([] as ParticipantRow[]),
      loadGoalsForMatches(coldMatchIds),
      loadGoalsForMatches(rainMatchIds),
      loadGoalsForMatches(sunnyMatchIds),
    ]);

  const coldGoalsByPlayer = new Map<number, number>();
  for (const goal of coldGoals) {
    if (goal.isOwnGoal) continue;
    coldGoalsByPlayer.set(goal.scorerPlayerId, (coldGoalsByPlayer.get(goal.scorerPlayerId) ?? 0) + 1);
  }

  const rainGoalsByPlayer = new Map<number, number>();
  const rainAssistsByPlayer = new Map<number, number>();
  for (const goal of rainGoals) {
    if (goal.isOwnGoal) continue;

    rainGoalsByPlayer.set(goal.scorerPlayerId, (rainGoalsByPlayer.get(goal.scorerPlayerId) ?? 0) + 1);

    if (goal.assistPlayerId !== null) {
      rainAssistsByPlayer.set(goal.assistPlayerId, (rainAssistsByPlayer.get(goal.assistPlayerId) ?? 0) + 1);
    }
  }

  const sunnyGoalsByPlayer = new Map<number, number>();
  const sunnyAssistsByPlayer = new Map<number, number>();
  for (const goal of sunnyGoals) {
    if (goal.isOwnGoal) continue;

    sunnyGoalsByPlayer.set(goal.scorerPlayerId, (sunnyGoalsByPlayer.get(goal.scorerPlayerId) ?? 0) + 1);

    if (goal.assistPlayerId !== null) {
      sunnyAssistsByPlayer.set(
        goal.assistPlayerId,
        (sunnyAssistsByPlayer.get(goal.assistPlayerId) ?? 0) + 1,
      );
    }
  }

  const mvpByPlayer = new Map<number, number>();
  for (const match of weatherMatches) {
    const isBadWeather =
      isRainMatch(match) || (match.temperatureC !== null && match.temperatureC < 10);

    if (!isBadWeather || match.mvpPlayerId === null) {
      continue;
    }

    mvpByPlayer.set(match.mvpPlayerId, (mvpByPlayer.get(match.mvpPlayerId) ?? 0) + 1);
  }

  const sunnyMvpByPlayer = new Map<number, number>();
  for (const match of weatherMatches) {
    const isSunnyMatch = isSunnyLikeWeather({
      conditionLabel: match.conditionLabel,
      precipMm: match.precipMm,
      temperatureC: match.temperatureC,
    });

    if (!isSunnyMatch || match.mvpPlayerId === null) {
      continue;
    }

    sunnyMvpByPlayer.set(match.mvpPlayerId, (sunnyMvpByPlayer.get(match.mvpPlayerId) ?? 0) + 1);
  }

  const allPlayerIds = Array.from(
    new Set([
      ...Array.from(coldGoalsByPlayer.keys()),
      ...Array.from(rainGoalsByPlayer.keys()),
      ...Array.from(rainAssistsByPlayer.keys()),
      ...Array.from(sunnyGoalsByPlayer.keys()),
      ...Array.from(sunnyAssistsByPlayer.keys()),
      ...Array.from(sunnyMvpByPlayer.keys()),
      ...Array.from(mvpByPlayer.keys()),
    ]),
  );

  const playerRows = allPlayerIds.length
    ? await db
        .select({
          id: players.id,
          name: players.name,
        })
        .from(players)
        .where(inArray(players.id, allPlayerIds))
    : [];

  const playerNameById = new Map(playerRows.map((player) => [player.id, player.name]));

  const coldGamesByPlayer = countGamesByPlayer(coldParticipants);
  const rainGamesByPlayer = countGamesByPlayer(rainParticipants);
  const badWeatherGamesByPlayer = countGamesByPlayer(badWeatherParticipants);
  const sunnyGamesByPlayer = countGamesByPlayer(sunnyParticipants);

  const sunnyTopScorers = mapToSortedRankingRows(
    sunnyGoalsByPlayer,
    sunnyGamesByPlayer,
    playerNameById,
  );
  const sunnyTopAssists = mapToSortedRankingRows(
    sunnyAssistsByPlayer,
    sunnyGamesByPlayer,
    playerNameById,
  );
  const sunnyMvps = mapToSortedRankingRows(sunnyMvpByPlayer, sunnyGamesByPlayer, playerNameById);

  const coldTopScorers = mapToSortedRankingRows(
    coldGoalsByPlayer,
    coldGamesByPlayer,
    playerNameById,
  );
  const rainTopScorers = mapToSortedRankingRows(
    rainGoalsByPlayer,
    rainGamesByPlayer,
    playerNameById,
  );
  const rainTopAssists = mapToSortedRankingRows(
    rainAssistsByPlayer,
    rainGamesByPlayer,
    playerNameById,
  );
  const badWeatherMvps = mapToSortedRankingRows(
    mvpByPlayer,
    badWeatherGamesByPlayer,
    playerNameById,
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/stats" className="hover:text-white">← Zurück zu Statistiken</Link>
        </p>

        <h1 className="text-2xl font-semibold">Wetter-Statistik</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Auswertung basiert ausschließlich auf gespeicherten Datensätzen in <code>match_weather</code>.
          Berücksichtigt werden nur Spiele mit vorhandenen Wetterdaten.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <RankingCard
            title="Schönwetter-Knipser 🌤️"
            subtitle="Topscorer in Spielen mit 0 mm Niederschlag und mindestens 15 °C"
            valueLabel="Tore"
            rows={sunnyTopScorers}
          />

          <RankingCard
            title="Schönwetter-Playmaker 🎯"
            subtitle="Top-Assists in Spielen mit 0 mm Niederschlag und mindestens 15 °C"
            valueLabel="Assists"
            rows={sunnyTopAssists}
          />

          <RankingCard
            title="Schönwetter-MVPs 🏆"
            subtitle="MVPs in Spielen mit 0 mm Niederschlag und mindestens 15 °C"
            valueLabel="MVPs"
            rows={sunnyMvps}
          />

          <RankingCard
            title="Eiskalte Knipser"
            subtitle="Topscorer in Spielen mit Temperatur unter 10 °C"
            valueLabel="Tore"
            rows={coldTopScorers}
          />

          <RankingCard
            title="Regen-Spezialisten"
            subtitle="Topscorer in Spielen mit Regen (Niederschlag > 0 oder Regen-Bedingung)"
            valueLabel="Tore"
            rows={rainTopScorers}
          />

          <RankingCard
            title="Vorlagengeber im Nassen"
            subtitle="Top-Assists in Regen-Spielen"
            valueLabel="Assists"
            rows={rainTopAssists}
          />

          <RankingCard
            title="Schlechtwetter-MVPs"
            subtitle="MVPs in Spielen mit Regen oder unter 10 °C"
            valueLabel="MVPs"
            rows={badWeatherMvps}
          />
        </div>
      </section>
    </main>
  );
}