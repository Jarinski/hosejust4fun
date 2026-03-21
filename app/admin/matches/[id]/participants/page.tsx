import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matchParticipants, matches, players } from "@/src/db/schema";
import { recalculateMatchMvp } from "@/src/lib/mvp";

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
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          Ungültige Match-ID.
        </section>
      </main>
    );
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
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          Spiel nicht gefunden.
        </section>
      </main>
    );
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

      await recalculateMatchMvp(targetMatchId);

      redirect(`/admin/matches/${targetMatchId}/participants?success=1`);
    } catch {
      redirect(`/admin/matches/${targetMatchId}/participants?error=1`);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h1 className="mb-2 text-xl font-semibold">Teilnehmer verwalten</h1>
        <p className="mb-4 text-zinc-300">
          Spiel #{match.id}: {match.team1Name} vs. {match.team2Name}
        </p>

        {queryParams.success === "1" ? (
          <p className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-emerald-300">
            Teilnehmer gespeichert.
          </p>
        ) : null}

        {queryParams.error === "1" ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Teilnehmer konnten nicht gespeichert werden.
          </p>
        ) : null}

        <form action={saveParticipants} className="flex flex-col gap-3">
          <input type="hidden" name="matchId" value={matchId} />

          {activePlayers.map((player) => {
            const selected = selectedByPlayerId.get(player.id) ?? "none";

            return (
              <label key={player.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <span className="text-zinc-200">{player.name}</span>
                <select
                  name={`player_${player.id}`}
                  defaultValue={selected}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                >
                  <option value="none">nicht dabei</option>
                  <option value="team_1">Team 1</option>
                  <option value="team_2">Team 2</option>
                </select>
              </label>
            );
          })}

          <button
            type="submit"
            className="mt-2 w-fit rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Speichern
          </button>
        </form>
      </section>
    </main>
  );
}