import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matchParticipants, matches, players } from "@/src/db/schema";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";
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
  await requireAdmin(`/admin/matches/${routeParams.id}/participants`);

  const matchId = Number(routeParams.id);
  if (!Number.isInteger(matchId)) {
    return (
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-6">
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
      <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
        <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-6">
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

    await requireAdminInAction();

    const matchIdRaw = formData.get("matchId");
    const targetMatchId = Number(matchIdRaw);
    const fallbackErrorPath = `/admin/matches/${matchId}/participants?error=1`;
    const errorPath = Number.isInteger(targetMatchId)
      ? `/admin/matches/${targetMatchId}/participants?error=1`
      : fallbackErrorPath;

    if (!Number.isInteger(targetMatchId)) {
      redirect(errorPath);
    }

    try {
      const validMatch = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.id, targetMatchId))
        .limit(1);

      if (validMatch.length === 0) {
        throw new Error("Spiel nicht gefunden");
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

      try {
        await recalculateMatchMvp(targetMatchId);
      } catch (error) {
        console.error("MVP konnte nach Teilnehmer-Update nicht neu berechnet werden", {
          matchId: targetMatchId,
          error,
        });
      }
    } catch {
      redirect(errorPath);
    }

    redirect(`/admin/matches/${targetMatchId}/participants?success=1`);
  }

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-6">
        <h1 className="mb-2 text-xl font-semibold">Teilnehmer verwalten</h1>
        <p className="mb-4 text-zinc-600">
          Spiel #{match.id}: {match.team1Name} vs. {match.team2Name}
        </p>

        {queryParams.success === "1" ? (
          <p className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700">
            Teilnehmer gespeichert.
          </p>
        ) : null}

        {queryParams.error === "1" ? (
          <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-700">
            Teilnehmer konnten nicht gespeichert werden.
          </p>
        ) : null}

        <form action={saveParticipants} className="flex flex-col gap-3">
          <input type="hidden" name="matchId" value={matchId} />

          {activePlayers.map((player) => {
            const selected = selectedByPlayerId.get(player.id) ?? "none";

            return (
              <label key={player.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <span className="text-zinc-800">{player.name}</span>
                <select
                  name={`player_${player.id}`}
                  defaultValue={selected}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2"
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
            className="mt-2 w-fit rounded-lg border border-zinc-300 bg-stone-50 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Speichern
          </button>
        </form>
      </section>
    </main>
  );
}