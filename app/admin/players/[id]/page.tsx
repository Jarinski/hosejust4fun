import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, matchWeather, players } from "@/src/db/schema";
import { isRainLikeWeather, isSunnyLikeWeather } from "@/src/lib/weatherIcons";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
};

type WeatherMatchRow = {
  matchId: number;
  temperatureC: number | null;
  precipMm: number | null;
  conditionLabel: string | null;
  mvpPlayerId: number | null;
};

type GoalRow = {
  matchId: number;
  scorerPlayerId: number;
  assistPlayerId: number | null;
  isOwnGoal: boolean;
};

function isRainMatch(match: WeatherMatchRow) {
  return isRainLikeWeather({
    conditionLabel: match.conditionLabel,
    precipMm: match.precipMm,
  });
}

function isColdMatch(match: WeatherMatchRow) {
  return match.temperatureC !== null && match.temperatureC < 10;
}

function isSunnyMatch(match: WeatherMatchRow) {
  return isSunnyLikeWeather({
    conditionLabel: match.conditionLabel,
    precipMm: match.precipMm,
    temperatureC: match.temperatureC,
  });
}

function isBadWeatherMatch(match: WeatherMatchRow) {
  return isRainMatch(match) || isColdMatch(match);
}

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

function buildWeatherSummary(values: {
  rainGoals: number;
  coldGoals: number;
  sunnyGoals: number;
  rainAssists: number;
  badWeatherMvps: number;
}) {
  const buckets = [
    { label: "Regen", score: values.rainGoals + values.rainAssists },
    { label: "Kälte", score: values.coldGoals },
    { label: "Schönwetter", score: values.sunnyGoals },
  ].sort((a, b) => b.score - a.score);

  if (values.badWeatherMvps >= 2) {
    return "Schlechtwetter-Leader: Mehrfach-MVP bei harten Bedingungen.";
  }

  if (buckets[0].score > 0 && buckets[0].score > buckets[1].score) {
    return `Lieblingsbedingungen: ${buckets[0].label}.`;
  }

  if (values.sunnyGoals > 0 && values.sunnyGoals >= values.rainGoals + values.coldGoals) {
    return "Stark bei Schönwetter.";
  }

  return null;
}

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const routeParams = await params;
  const playerId = Number(routeParams.id);

  if (!Number.isInteger(playerId)) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="mb-4 text-sm text-zinc-300">
            <Link href="/admin/stats" className="hover:text-white">← Zurück zu Statistiken</Link>
          </p>
          <h1 className="mb-2 text-xl font-semibold">Spieler</h1>
          <p className="text-zinc-400">Ungültige Spieler-ID.</p>
        </section>
      </main>
    );
  }

  const playerRows = await db
    .select({
      id: players.id,
      name: players.name,
    })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const player = playerRows[0];

  if (!player) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="mb-4 text-sm text-zinc-300">
            <Link href="/admin/stats" className="hover:text-white">← Zurück zu Statistiken</Link>
          </p>
          <h1 className="mb-2 text-xl font-semibold">Spieler nicht gefunden</h1>
          <p className="text-zinc-400">Zu dieser ID gibt es keinen Spieler.</p>
        </section>
      </main>
    );
  }

  const gameCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchParticipants)
    .where(eq(matchParticipants.playerId, playerId));

  const goalCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(goalEvents)
    .where(eq(goalEvents.scorerPlayerId, playerId));

  const assistCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(goalEvents)
    .where(eq(goalEvents.assistPlayerId, playerId));

  const recentMatches = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Name: matches.team1Name,
      team2Name: matches.team2Name,
    })
    .from(matchParticipants)
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(eq(matchParticipants.playerId, playerId))
    .orderBy(desc(matches.matchDate), desc(matches.id))
    .limit(10);

  const weatherMatches = await db
    .select({
      matchId: matchParticipants.matchId,
      temperatureC: matchWeather.temperatureC,
      precipMm: matchWeather.precipMm,
      conditionLabel: matchWeather.conditionLabel,
      mvpPlayerId: matches.mvpPlayerId,
    })
    .from(matchParticipants)
    .innerJoin(matchWeather, eq(matchParticipants.matchId, matchWeather.matchId))
    .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
    .where(eq(matchParticipants.playerId, playerId));

  const weatherMatchIds = weatherMatches.map((match) => match.matchId);
  const weatherGoals = await loadGoalsForMatches(weatherMatchIds);

  const rainMatchIdSet = new Set(weatherMatches.filter(isRainMatch).map((match) => match.matchId));
  const coldMatchIdSet = new Set(weatherMatches.filter(isColdMatch).map((match) => match.matchId));
  const sunnyMatchIdSet = new Set(weatherMatches.filter(isSunnyMatch).map((match) => match.matchId));
  const badWeatherMatchIdSet = new Set(
    weatherMatches.filter(isBadWeatherMatch).map((match) => match.matchId),
  );

  let rainGoals = 0;
  let coldGoals = 0;
  let sunnyGoals = 0;
  let rainAssists = 0;

  for (const goal of weatherGoals) {
    if (goal.isOwnGoal) {
      continue;
    }

    const isOwnGoalFilteredScorer = goal.scorerPlayerId === playerId;
    const isOwnGoalFilteredAssist = goal.assistPlayerId === playerId;

    if (isOwnGoalFilteredScorer) {
      if (rainMatchIdSet.has(goal.matchId)) rainGoals += 1;
      if (coldMatchIdSet.has(goal.matchId)) coldGoals += 1;
      if (sunnyMatchIdSet.has(goal.matchId)) sunnyGoals += 1;
    }

    if (isOwnGoalFilteredAssist && rainMatchIdSet.has(goal.matchId)) {
      rainAssists += 1;
    }
  }

  const mvpByMatchId = new Map<number, number | null>();
  for (const match of weatherMatches) {
    if (!mvpByMatchId.has(match.matchId)) {
      mvpByMatchId.set(match.matchId, match.mvpPlayerId);
    }
  }

  let badWeatherMvps = 0;
  for (const matchId of badWeatherMatchIdSet) {
    if (mvpByMatchId.get(matchId) === playerId) {
      badWeatherMvps += 1;
    }
  }

  const weatherGames = {
    rain: rainMatchIdSet.size,
    cold: coldMatchIdSet.size,
    sunny: sunnyMatchIdSet.size,
    bad: badWeatherMatchIdSet.size,
  };

  const weatherSummary = buildWeatherSummary({
    rainGoals,
    coldGoals,
    sunnyGoals,
    rainAssists,
    badWeatherMvps,
  });

  const games = gameCountRows[0]?.count ?? 0;
  const goals = goalCountRows[0]?.count ?? 0;
  const assists = assistCountRows[0]?.count ?? 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <p className="mb-4 text-sm text-zinc-300">
          <Link href="/admin/stats" className="hover:text-white">← Zurück zu Statistiken</Link>
        </p>
        <h1 className="mb-4 text-2xl font-semibold">{player.name}</h1>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Spiele</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{games}</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Tore</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{goals}</p>
          </article>
          <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <p className="text-xs uppercase tracking-wider text-zinc-400">Assists</p>
            <p className="mt-1 text-2xl font-bold text-red-300">{assists}</p>
          </article>
        </section>

        <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Wetterprofil</h2>
              <p className="text-xs text-zinc-400">
                Nur gespeicherte Wetterdaten aus <code>match_weather</code>; nur Spiele mit Teilnahme.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400">🌧️ Tore bei Regen</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{rainGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400">🥶 Tore unter 10 °C</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{coldGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400">🌤️ Tore bei Schönwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{sunnyGoals}</p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400">🎯 Assists bei Regen</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{rainAssists}</p>
            </article>

            <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
              <p className="text-xs uppercase tracking-wider text-zinc-400">🏆 MVPs bei Schlechtwetter</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{badWeatherMvps}</p>
            </article>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="text-xs text-zinc-400">Einsätze Regen 🌧️</p>
              <p className="mt-1 text-xl font-semibold text-zinc-100">{weatherGames.rain}</p>
            </article>
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="text-xs text-zinc-400">Einsätze Kälte 🥶</p>
              <p className="mt-1 text-xl font-semibold text-zinc-100">{weatherGames.cold}</p>
            </article>
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="text-xs text-zinc-400">Einsätze Schönwetter 🌤️</p>
              <p className="mt-1 text-xl font-semibold text-zinc-100">{weatherGames.sunny}</p>
            </article>
            <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="text-xs text-zinc-400">Einsätze Schlechtwetter 🌧️🥶</p>
              <p className="mt-1 text-xl font-semibold text-zinc-100">{weatherGames.bad}</p>
            </article>
          </div>

          {weatherSummary ? (
            <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300">
              {weatherSummary}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Letzte Spiele</h2>
          {recentMatches.length === 0 ? (
            <p className="text-zinc-400">Noch keine Spiele für diesen Spieler erfasst.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentMatches.map((match) => (
                <li key={match.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  {match.matchDate.toLocaleDateString("de-DE")} – {match.team1Name} vs {match.team2Name}{" "}
                  <Link href={`/admin/matches/${match.id}`} className="ml-2 text-red-300 hover:text-red-200">
                    Zum Match
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}