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
      <main className="p-6">
        <p className="mb-4">
          <Link href="/admin/stats">← Zurück zu Statistiken</Link>
        </p>
        <h1 className="text-xl font-semibold mb-2">Spieler</h1>
        <p>Ungültige Spieler-ID.</p>
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
      <main className="p-6">
        <p className="mb-4">
          <Link href="/admin/stats">← Zurück zu Statistiken</Link>
        </p>
        <h1 className="text-xl font-semibold mb-2">Spieler nicht gefunden</h1>
        <p>Zu dieser ID gibt es keinen Spieler.</p>
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
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/stats">← Zurück zu Statistiken</Link>
      </p>

      <h1 className="text-xl font-semibold mb-4">{player.name}</h1>

      <section className="mb-6 space-y-1">
        <p>Spiele: {games}</p>
        <p>Tore: {goals}</p>
        <p>Assists: {assists}</p>
      </section>

      <section>
        <h2 className="font-medium mb-2">Letzte Spiele</h2>
        {recentMatches.length === 0 ? (
          <p>Noch keine Spiele für diesen Spieler erfasst.</p>
        ) : (
          <ul className="space-y-2">
            {recentMatches.map((match) => (
              <li key={match.id}>
                {match.matchDate.toLocaleDateString("de-DE")} – {match.team1Name} vs {match.team2Name}{" "}
                <Link href={`/admin/matches/${match.id}`}>Zum Match</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}