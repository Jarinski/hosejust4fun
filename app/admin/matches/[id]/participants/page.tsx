import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matchParticipants, matches, players } from "@/src/db/schema";

export default async function MatchParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const routeParams = await params;
  const queryParams = await searchParams;

  const matchId = Number(routeParams.id);
  if (!Number.isInteger(matchId)) {
    return <main className="p-6">Ungültige Match-ID.</main>;
  }

  const matchRows = await db
    .select({
      id: matches.id,
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

  const activePlayers = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.isActive, true))
    .orderBy(asc(players.name));

  const existing = await db
    .select({ playerId: matchParticipants.playerId, teamSide: matchParticipants.teamSide })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  const selectedByPlayerId = new Map(existing.map((row) => [row.playerId, row.teamSide]));

  async function saveParticipants(formData: FormData) {
    "use server";

    const matchIdRaw = formData.get("matchId");
    const targetMatchId = Number(matchIdRaw);

    if (!Number.isInteger(targetMatchId)) {
      redirect(`/admin/matches/${matchId}?error=1`);
    }

    try {
      const validMatch = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.id, targetMatchId))
        .limit(1);

      if (validMatch.length === 0) {
        redirect(`/admin/matches/${targetMatchId}/participants?error=1`);
      }

      const activePlayerRows = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.isActive, true));

      await db
        .delete(matchParticipants)
        .where(eq(matchParticipants.matchId, targetMatchId));

      const rowsToInsert: Array<{
        matchId: number;
        playerId: number;
        teamSide: "team_1" | "team_2";
      }> = [];
      const seenPlayerIds = new Set<number>();

      for (const player of activePlayerRows) {
        const selection = formData.get(`player_${player.id}`);

        if (
          (selection === "team_1" || selection === "team_2") &&
          !seenPlayerIds.has(player.id)
        ) {
          rowsToInsert.push({
            matchId: targetMatchId,
            playerId: player.id,
            teamSide: selection,
          });
          seenPlayerIds.add(player.id);
        }
      }

      if (rowsToInsert.length > 0) {
        await db.insert(matchParticipants).values(rowsToInsert);
      }

      redirect(`/admin/matches/${targetMatchId}/participants?success=1`);
    } catch {
      redirect(`/admin/matches/${targetMatchId}/participants?error=1`);
    }
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-2">Teilnehmer verwalten</h1>
      <p className="mb-4">
        Spiel #{match.id}: {match.team1Name} vs. {match.team2Name}
      </p>

      {queryParams.success === "1" ? (
        <p className="mb-4 text-green-700">Teilnehmer gespeichert.</p>
      ) : null}

      {queryParams.error === "1" ? (
        <p className="mb-4 text-red-700">
          Teilnehmer konnten nicht gespeichert werden.
        </p>
      ) : null}

      <form action={saveParticipants} className="flex flex-col gap-3 max-w-xl">
        <input type="hidden" name="matchId" value={matchId} />

        {activePlayers.map((player) => {
          const selected = selectedByPlayerId.get(player.id) ?? "none";

          return (
            <label key={player.id} className="flex items-center gap-3">
              <span className="min-w-40">{player.name}</span>
              <select name={`player_${player.id}`} defaultValue={selected}>
                <option value="none">nicht dabei</option>
                <option value="team_1">Team 1</option>
                <option value="team_2">Team 2</option>
              </select>
            </label>
          );
        })}

        <button type="submit">Speichern</button>
      </form>
    </main>
  );
}