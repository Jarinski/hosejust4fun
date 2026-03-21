import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players } from "@/src/db/schema";

type PlayerDetailPageProps = {
  params: Promise<{ id: string }>;
};

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