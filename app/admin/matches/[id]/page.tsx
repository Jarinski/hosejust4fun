import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players } from "@/src/db/schema";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const routeParams = await params;
  const matchId = Number(routeParams.id);

  if (!Number.isInteger(matchId)) {
    return <main className="p-6">Ungültige Match-ID.</main>;
  }

  const matchRows = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Name: matches.team1Name,
      team2Name: matches.team2Name,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  const match = matchRows[0];

  if (!match) {
    return <main className="p-6">Spiel nicht gefunden.</main>;
  }

  const participantRows = await db
    .select({
      id: matchParticipants.id,
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
      playerName: players.name,
    })
    .from(matchParticipants)
    .innerJoin(players, eq(players.id, matchParticipants.playerId))
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(players.name));

  const goalRows = await db
    .select({
      id: goalEvents.id,
      teamSide: goalEvents.teamSide,
      scorerPlayerId: goalEvents.scorerPlayerId,
      assistPlayerId: goalEvents.assistPlayerId,
      minute: goalEvents.minute,
      goalType: goalEvents.goalType,
      createdAt: goalEvents.createdAt,
    })
    .from(goalEvents)
    .where(eq(goalEvents.matchId, matchId));

  const involvedPlayerIds = Array.from(
    new Set(
      goalRows
        .flatMap((goal) => [goal.scorerPlayerId, goal.assistPlayerId])
        .filter((id): id is number => Number.isInteger(id))
    )
  );

  const goalPlayers =
    involvedPlayerIds.length > 0
      ? await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, involvedPlayerIds))
      : [];

  const playerNameById = new Map<number, string>();

  for (const participant of participantRows) {
    playerNameById.set(participant.playerId, participant.playerName);
  }

  for (const player of goalPlayers) {
    playerNameById.set(player.id, player.name);
  }

  const team1Participants = participantRows.filter((row) => row.teamSide === "team_1");
  const team2Participants = participantRows.filter((row) => row.teamSide === "team_2");

  const team1Goals = goalRows.filter((goal) => goal.teamSide === "team_1").length;
  const team2Goals = goalRows.filter((goal) => goal.teamSide === "team_2").length;

  const sortedGoals = [...goalRows].sort((a, b) => {
    if (a.minute !== null && b.minute !== null && a.minute !== b.minute) {
      return a.minute - b.minute;
    }

    if (a.minute !== null && b.minute === null) {
      return -1;
    }

    if (a.minute === null && b.minute !== null) {
      return 1;
    }

    const aCreatedAt = a.createdAt ? a.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    const bCreatedAt = b.createdAt ? b.createdAt.getTime() : Number.MAX_SAFE_INTEGER;

    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    return a.id - b.id;
  });

  return (
    <main className="p-6">
      <p className="mb-4">
        <Link href="/admin/matches">← Zurück zur Match-Liste</Link>
      </p>

      <h1 className="text-xl font-semibold">
        {match.matchDate.toLocaleDateString("de-DE")} – {match.team1Name} vs {match.team2Name}
      </h1>
      <p className="mt-2 mb-6 text-lg">
        Ergebnis: {team1Goals} : {team2Goals}
      </p>

      <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-medium mb-2">Team 1 ({match.team1Name})</h2>
          <ul className="list-disc pl-5">
            {team1Participants.length === 0 ? <li>Keine Spieler</li> : null}
            {team1Participants.map((participant) => (
              <li key={participant.id}>{participant.playerName}</li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-medium mb-2">Team 2 ({match.team2Name})</h2>
          <ul className="list-disc pl-5">
            {team2Participants.length === 0 ? <li>Keine Spieler</li> : null}
            {team2Participants.map((participant) => (
              <li key={participant.id}>{participant.playerName}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">Tore</h2>
        <ul className="list-disc pl-5">
          {sortedGoals.length === 0 ? <li>Keine Tore erfasst.</li> : null}
          {sortedGoals.map((goal) => {
            const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
            const assistName =
              goal.assistPlayerId !== null
                ? (playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`)
                : null;

            return (
              <li key={goal.id}>
                {goal.minute !== null ? `${goal.minute}'. ` : ""}
                {scorerName}
                {assistName ? ` (Vorlage: ${assistName})` : ""}
                {goal.goalType ? ` [${goal.goalType}]` : ""}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}