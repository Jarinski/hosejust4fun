import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matchParticipants, matches, players } from "@/src/db/schema";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";
import { recalculateMatchMvp } from "@/src/lib/mvp";

// Obergrenze für die Wechselminute. Bewusst großzügig, damit auch lange
// Nachspielzeiten erfassbar bleiben.
const MAX_SWITCH_MINUTE = 120;

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
    .select({
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
      fromMinute: matchParticipants.fromMinute,
    })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(matchParticipants.playerId), asc(matchParticipants.fromMinute));

  // Erster Abschnitt = Startseite, ein zweiter Abschnitt = Wechsel.
  const startSideByPlayerId = new Map<number, "team_1" | "team_2">();
  const switchByPlayerId = new Map<number, { minute: number; teamSide: "team_1" | "team_2" }>();

  for (const row of existing) {
    if (!startSideByPlayerId.has(row.playerId)) {
      startSideByPlayerId.set(row.playerId, row.teamSide);
      continue;
    }

    switchByPlayerId.set(row.playerId, { minute: row.fromMinute, teamSide: row.teamSide });
  }

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
        fromMinute: number;
        toMinute: number | null;
      }> = [];
      const seenPlayerIds = new Set<number>();

      for (const player of activePlayerRows) {
        const selection = formData.get(`player_${player.id}`);

        if (
          (selection !== "team_1" && selection !== "team_2") ||
          seenPlayerIds.has(player.id)
        ) {
          continue;
        }

        seenPlayerIds.add(player.id);

        const switchMinuteRaw = String(formData.get(`switch_minute_${player.id}`) ?? "").trim();
        const switchMinute = switchMinuteRaw === "" ? null : Number(switchMinuteRaw);
        const hasValidSwitch =
          switchMinute !== null &&
          Number.isInteger(switchMinute) &&
          switchMinute > 0 &&
          switchMinute < MAX_SWITCH_MINUTE;

        if (!hasValidSwitch) {
          rowsToInsert.push({
            matchId: targetMatchId,
            playerId: player.id,
            teamSide: selection,
            fromMinute: 0,
            toMinute: null,
          });
          continue;
        }

        // Wechsel: bis zur Minute auf der Startseite, danach auf der Gegenseite.
        const otherSide = selection === "team_1" ? "team_2" : "team_1";

        rowsToInsert.push({
          matchId: targetMatchId,
          playerId: player.id,
          teamSide: selection,
          fromMinute: 0,
          toMinute: switchMinute,
        });
        rowsToInsert.push({
          matchId: targetMatchId,
          playerId: player.id,
          teamSide: otherSide,
          fromMinute: switchMinute,
          toMinute: null,
        });
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
            const selected = startSideByPlayerId.get(player.id) ?? "none";
            const switchInfo = switchByPlayerId.get(player.id);

            return (
              <div key={player.id} className="rounded-lg border border-zinc-300 bg-stone-50 p-3">
                <label className="grid grid-cols-[1fr_auto] items-center gap-3">
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

                <label className="mt-2 flex items-center justify-end gap-2 text-sm text-zinc-500">
                  <span>wechselt ab Minute</span>
                  <input
                    type="number"
                    name={`switch_minute_${player.id}`}
                    defaultValue={switchInfo ? String(switchInfo.minute) : ""}
                    min={1}
                    max={MAX_SWITCH_MINUTE - 1}
                    placeholder="—"
                    className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right"
                  />
                  <span>zur anderen Seite</span>
                </label>
              </div>
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