import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, matchWeather, players, seasons } from "@/src/db/schema";
import { buildMatchStory } from "@/src/lib/matchStory";

type MatchBrief = {
  id: number;
  matchDate: Date;
  seasonName: string | null;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  mvpPlayerId: number | null;
  mvpName: string | null;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
}

export default async function Home() {
  const mvpPlayers = alias(players, "mvp_players");
  const scorerPlayers = alias(players, "scorer_players");
  
  type LatestMatchGoal = {
    teamSide: "team_1" | "team_2";
    isOwnGoal: boolean;
    scorerPlayerId: number;
    scorerName: string;
    assistPlayerId: number | null;
  };

  let mvpColumnAvailable = true;
  let recentMatches: MatchBrief[] = [];
  let allMatchesForSeries: MatchBrief[] = [];

  try {
    recentMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: matches.mvpPlayerId,
        mvpName: mvpPlayers.name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(mvpPlayers, eq(matches.mvpPlayerId, mvpPlayers.id))
      .orderBy(desc(matches.matchDate), desc(matches.id))
      .limit(5);

    allMatchesForSeries = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: matches.mvpPlayerId,
        mvpName: mvpPlayers.name,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .leftJoin(mvpPlayers, eq(matches.mvpPlayerId, mvpPlayers.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));
  } catch {
    mvpColumnAvailable = false;

    const recentBaseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: sql<number | null>`null`,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate), desc(matches.id))
      .limit(5);

    const allBaseMatches = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        seasonName: seasons.name,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        team1Score: matches.team1Score,
        team2Score: matches.team2Score,
        mvpPlayerId: sql<number | null>`null`,
      })
      .from(matches)
      .leftJoin(seasons, eq(matches.seasonId, seasons.id))
      .orderBy(desc(matches.matchDate), desc(matches.id));

    recentMatches = recentBaseMatches.map((match) => ({ ...match, mvpName: null }));
    allMatchesForSeries = allBaseMatches.map((match) => ({ ...match, mvpName: null }));
  }

  const latestMatch = recentMatches[0] ?? null;
  let ownGoalColumnAvailable = true;

  let latestMatchGoals: LatestMatchGoal[] = [];
  if (latestMatch) {
    try {
      latestMatchGoals = await db
        .select({
          teamSide: goalEvents.teamSide,
          isOwnGoal: goalEvents.isOwnGoal,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: scorerPlayers.name,
          assistPlayerId: goalEvents.assistPlayerId,
        })
        .from(goalEvents)
        .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
        .where(eq(goalEvents.matchId, latestMatch.id));
    } catch {
      ownGoalColumnAvailable = false;

      const legacyGoals = await db
        .select({
          teamSide: goalEvents.teamSide,
          scorerPlayerId: goalEvents.scorerPlayerId,
          scorerName: scorerPlayers.name,
          assistPlayerId: goalEvents.assistPlayerId,
        })
        .from(goalEvents)
        .innerJoin(scorerPlayers, eq(goalEvents.scorerPlayerId, scorerPlayers.id))
        .where(eq(goalEvents.matchId, latestMatch.id));

      latestMatchGoals = legacyGoals.map((goal) => ({
        ...goal,
        isOwnGoal: false,
      }));
    }
  }

  const latestMatchWeather = latestMatch
    ? await db
        .select({
          conditionLabel: matchWeather.conditionLabel,
          temperatureC: matchWeather.temperatureC,
          precipMm: matchWeather.precipMm,
        })
        .from(matchWeather)
        .where(eq(matchWeather.matchId, latestMatch.id))
        .then((rows) => rows[0] ?? null)
        .catch(() => null)
    : null;

  const goalsCount = sql<number>`count(${goalEvents.id})`;
  const assistsCount = sql<number>`count(${goalEvents.id})`;
  const mvpCount = sql<number>`count(${matches.id})`;
  const gamesCount = sql<number>`count(${matchParticipants.id})`;

  const [topScorers, topAssists, mostGames] = await Promise.all([
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: goalsCount.as("value"),
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.scorerPlayerId, players.id))
      .groupBy(players.id, players.name)
      .orderBy(desc(goalsCount), asc(players.name))
      .limit(5),
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: assistsCount.as("value"),
      })
      .from(goalEvents)
      .innerJoin(players, eq(goalEvents.assistPlayerId, players.id))
      .where(isNotNull(goalEvents.assistPlayerId))
      .groupBy(players.id, players.name)
      .orderBy(desc(assistsCount), asc(players.name))
      .limit(5),
    db
      .select({
        playerId: players.id,
        playerName: players.name,
        value: gamesCount.as("value"),
      })
      .from(matchParticipants)
      .innerJoin(players, eq(matchParticipants.playerId, players.id))
      .groupBy(players.id, players.name)
      .orderBy(desc(gamesCount), asc(players.name))
      .limit(5),
  ]);

  const topMvps = mvpColumnAvailable
    ? await db
        .select({
          playerId: players.id,
          playerName: players.name,
          value: mvpCount.as("value"),
        })
        .from(matches)
        .innerJoin(players, eq(matches.mvpPlayerId, players.id))
        .where(isNotNull(matches.mvpPlayerId))
        .groupBy(players.id, players.name)
        .orderBy(desc(mvpCount), asc(players.name))
        .limit(5)
    : [];

  const newsflash = latestMatch
    ? buildMatchStory({
        match: {
          team1Name: latestMatch.team1Name,
          team2Name: latestMatch.team2Name,
          team1Goals: latestMatch.team1Score,
          team2Goals: latestMatch.team2Score,
          mvpPlayerId: latestMatch.mvpPlayerId,
          mvpName: latestMatch.mvpName,
        },
        goals: latestMatchGoals,
        weather: latestMatchWeather,
        previousMatches: allMatchesForSeries.slice(1).map((match) => ({
          team1Name: match.team1Name,
          team2Name: match.team2Name,
          team1Goals: match.team1Score,
          team2Goals: match.team2Score,
        })),
      }).slice(0, ownGoalColumnAvailable ? 3 : 2)
    : [];

  const statCards = [
    {
      title: "Topscorer",
      leader: topScorers[0]?.playerName ?? "—",
      value: topScorers[0]?.value ?? 0,
      info:
        topScorers.length > 1
          ? `${topScorers[0].value - topScorers[1].value} Tore Vorsprung`
          : "Allein an der Spitze",
    },
    {
      title: "Top-Vorlagengeber",
      leader: topAssists[0]?.playerName ?? "—",
      value: topAssists[0]?.value ?? 0,
      info:
        topAssists.length > 1
          ? `${topAssists[0].value - topAssists[1].value} Assists Vorsprung`
          : "Playmaker Nummer 1",
    },
    {
      title: "MVP-Leader",
      leader: topMvps[0]?.playerName ?? "—",
      value: topMvps[0]?.value ?? 0,
      info:
        topMvps.length > 1
          ? `${topMvps[0].value - topMvps[1].value} MVPs Vorsprung`
          : "Konstant bester Mann",
    },
    {
      title: "Meiste Spiele",
      leader: mostGames[0]?.playerName ?? "—",
      value: mostGames[0]?.value ?? 0,
      info: mostGames.length > 1 ? `${mostGames[1].playerName} folgt dahinter` : "Dauerbrenner",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 sm:py-8">
        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Matchday Dashboard</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">HoSe Just4Fun</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-300 sm:text-base">
            Das kompakte Fußball-Magazin für eure Runde: Ergebnisse, Trends, Storylines und die
            stärksten Performer auf einen Blick.
          </p>

          {latestMatch ? (
            <article className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-400">Letztes Spiel</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <p className="text-lg font-semibold text-zinc-100 sm:text-xl">{latestMatch.team1Name}</p>
                <p className="text-center text-3xl font-extrabold text-zinc-100 sm:text-4xl">
                  {latestMatch.team1Score}:{latestMatch.team2Score}
                </p>
                <p className="text-left text-lg font-semibold text-zinc-100 sm:text-right sm:text-xl">{latestMatch.team2Name}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300 sm:text-sm">
                <span>{formatDate(latestMatch.matchDate)}</span>
                <span>Saison: {latestMatch.seasonName ?? "—"}</span>
                <span>MVP: {latestMatch.mvpName ?? "nicht vergeben"}</span>
              </div>
            </article>
          ) : (
            <article className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-5">
              <p className="text-zinc-300">Noch keine Spiele erfasst.</p>
            </article>
          )}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold sm:text-xl">Newsflash</h2>
            <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] uppercase tracking-wider text-zinc-300">
              Redaktion
            </span>
          </div>
          {newsflash.length > 0 ? (
            <ul className="space-y-2 text-sm text-zinc-200">
              {newsflash.map((item, index) => (
                <li key={`${item}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-zinc-400">Sobald Spiele vorhanden sind, erscheinen hier die Storylines.</p>
          )}
        </section>

        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 transition hover:-translate-y-0.5 hover:border-zinc-500"
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">{card.title}</p>
              <p className="mt-1.5 text-base font-semibold text-zinc-100">{card.leader}</p>
              <p className="mt-1.5 text-3xl font-extrabold text-zinc-100">{card.value}</p>
              <p className="mt-1.5 text-xs text-zinc-400 sm:text-sm">{card.info}</p>
            </article>
          ))}
        </section>

        <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-bold sm:text-xl">Letzte Spiele</h2>
          {recentMatches.length === 0 ? (
            <p className="text-zinc-400">Noch keine Spiele eingetragen.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {recentMatches.map((match) => {
                const margin = Math.abs(match.team1Score - match.team2Score);
                const detail = margin >= 3 ? "Klarer Sieg" : margin === 1 ? "Knappe Kiste" : "Ausgeglichen";

                return (
                  <Link
                    key={match.id}
                    href={`/admin/matches/${match.id}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 transition hover:border-zinc-500"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-100">{match.team1Name}</p>
                      <p className="text-xl font-bold text-zinc-100">
                        {match.team1Score}:{match.team2Score}
                      </p>
                      <p className="text-right font-semibold text-zinc-100">{match.team2Name}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300 sm:text-sm">
                      <span>{formatDate(match.matchDate)}</span>
                      <span>{match.seasonName ?? "—"}</span>
                      <span>MVP: {match.mvpName ?? "—"}</span>
                      <span>{detail}</span>
                      <span className="font-medium text-zinc-100">Insights ansehen →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-bold sm:text-xl">Rankings</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "Topscorer Top 5", data: topScorers, unit: "Tore" },
              { title: "Top-Assists Top 5", data: topAssists, unit: "Assists" },
              { title: "Top-MVPs Top 5", data: topMvps, unit: "MVP" },
            ].map((ranking) => (
              <article key={ranking.title} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300 sm:text-sm">
                  {ranking.title}
                </h3>
                {ranking.data.length === 0 ? (
                  <p className="text-sm text-zinc-400">Noch keine Daten.</p>
                ) : (
                  <ol className="space-y-1.5 text-sm">
                    {ranking.data.map((entry, index) => (
                      <li key={entry.playerId} className="flex items-center justify-between gap-3">
                        <span className="text-zinc-100">
                          <span className="mr-2 text-zinc-400">#{index + 1}</span>
                          {entry.playerName}
                        </span>
                        <span className="font-semibold text-zinc-100">
                          {entry.value} {ranking.unit}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5 text-sm">
            <Link
              href="/admin/matches"
              className="rounded-lg border border-zinc-700 bg-zinc-100 px-3.5 py-2 text-zinc-900 transition hover:bg-zinc-300"
            >
              Matches verwalten
            </Link>
            <Link
              href="/admin/stats"
              className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3.5 py-2 text-zinc-100 transition hover:border-zinc-500"
            >
              Mehr Statistiken
            </Link>
            <Link
              href="/admin/players"
              className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3.5 py-2 text-zinc-100 transition hover:border-zinc-500"
            >
              Spielerübersicht
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
