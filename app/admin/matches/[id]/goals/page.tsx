import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players } from "@/src/db/schema";
import { GoalsForm } from "./GoalsForm";

type TeamSide = "team_1" | "team_2";

const ALLOWED_GOAL_TYPES = new Set(["normal", "solo", "corner", "rebound", "longshot"]);

export default async function MatchGoalsPage({
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
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
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
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          Spiel nicht gefunden.
        </section>
      </main>
    );
  }

  const participantRows = await db
    .select({
      playerId: matchParticipants.playerId,
      teamSide: matchParticipants.teamSide,
      playerName: players.name,
    })
    .from(matchParticipants)
    .innerJoin(players, eq(players.id, matchParticipants.playerId))
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(players.name));

  const team1Players = participantRows
    .filter((row) => row.teamSide === "team_1")
    .map((row) => ({ id: row.playerId, name: row.playerName }));

  const team2Players = participantRows
    .filter((row) => row.teamSide === "team_2")
    .map((row) => ({ id: row.playerId, name: row.playerName }));

  async function saveGoals(formData: FormData) {
    "use server";

    const matchIdRaw = formData.get("matchId");
    const targetMatchId = Number(matchIdRaw);

    if (!Number.isInteger(targetMatchId)) {
      redirect(`/admin/matches/${routeParams.id}/goals?error=invalid_match`);
    }

    const existingMatch = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.id, targetMatchId))
      .limit(1);

    if (existingMatch.length === 0) {
      redirect(`/admin/matches/${targetMatchId}/goals?error=invalid_match`);
    }

    const participants = await db
      .select({
        playerId: matchParticipants.playerId,
        teamSide: matchParticipants.teamSide,
      })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, targetMatchId));

    const team1Ids = new Set(
      participants
        .filter((participant) => participant.teamSide === "team_1")
        .map((participant) => participant.playerId)
    );
    const team2Ids = new Set(
      participants
        .filter((participant) => participant.teamSide === "team_2")
        .map((participant) => participant.playerId)
    );

    const rowCountRaw = Number(formData.get("rowCount"));
    const rowCount = Number.isInteger(rowCountRaw) && rowCountRaw > 0 ? rowCountRaw : 20;

    const rowsToInsert: Array<{
      matchId: number;
      teamSide: TeamSide;
      scorerPlayerId: number;
      assistPlayerId?: number;
      minute?: number;
      goalType?: string;
    }> = [];

    for (let i = 0; i < rowCount; i += 1) {
      const scorerRaw = String(formData.get(`row_${i}_scorerPlayerId`) ?? "").trim();
      if (!scorerRaw) {
        continue;
      }

      const teamSideRaw = String(formData.get(`row_${i}_teamSide`) ?? "").trim();
      if (teamSideRaw !== "team_1" && teamSideRaw !== "team_2") {
        redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
      }

      const scorerPlayerId = Number(scorerRaw);
      if (!Number.isInteger(scorerPlayerId)) {
        redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
      }

      const validScorer =
        teamSideRaw === "team_1" ? team1Ids.has(scorerPlayerId) : team2Ids.has(scorerPlayerId);

      if (!validScorer) {
        redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
      }

      const assistRaw = String(formData.get(`row_${i}_assistPlayerId`) ?? "").trim();
      let assistPlayerId: number | undefined;

      if (assistRaw) {
        assistPlayerId = Number(assistRaw);

        if (!Number.isInteger(assistPlayerId) || assistPlayerId === scorerPlayerId) {
          redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
        }

        const validAssist =
          teamSideRaw === "team_1" ? team1Ids.has(assistPlayerId) : team2Ids.has(assistPlayerId);

        if (!validAssist) {
          redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
        }
      }

      const minuteRaw = String(formData.get(`row_${i}_minute`) ?? "").trim();
      let minute: number | undefined;

      if (minuteRaw) {
        minute = Number(minuteRaw);
        if (!Number.isInteger(minute) || minute < 0) {
          redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
        }
      }

      const goalTypeRaw = String(formData.get(`row_${i}_goalType`) ?? "").trim();
      const goalType = goalTypeRaw && ALLOWED_GOAL_TYPES.has(goalTypeRaw) ? goalTypeRaw : undefined;

      if (goalTypeRaw && !goalType) {
        redirect(`/admin/matches/${targetMatchId}/goals?error=validation`);
      }

      rowsToInsert.push({
        matchId: targetMatchId,
        teamSide: teamSideRaw,
        scorerPlayerId,
        assistPlayerId,
        minute,
        goalType,
      });
    }

    await db.delete(goalEvents).where(eq(goalEvents.matchId, targetMatchId));

    if (rowsToInsert.length > 0) {
      await db.insert(goalEvents).values(rowsToInsert);
    }

    redirect(`/admin/matches/${targetMatchId}/goals?success=1`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h1 className="mb-2 text-xl font-semibold">Tore erfassen</h1>
        <p className="mb-4 text-zinc-300">
          Spiel #{match.id}: {match.team1Name} vs. {match.team2Name}
        </p>

        {queryParams.success === "1" ? (
          <p className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-emerald-300">
            Tore wurden gespeichert.
          </p>
        ) : null}

        {queryParams.error ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Tore konnten nicht gespeichert werden.
          </p>
        ) : null}

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <h2 className="mb-2 font-medium">Team 1 ({match.team1Name})</h2>
            <ul className="list-disc pl-5 text-zinc-200">
            {team1Players.length === 0 ? <li>Keine Teilnehmer</li> : null}
            {team1Players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <h2 className="mb-2 font-medium">Team 2 ({match.team2Name})</h2>
            <ul className="list-disc pl-5 text-zinc-200">
            {team2Players.length === 0 ? <li>Keine Teilnehmer</li> : null}
            {team2Players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
          </div>
        </section>

        <GoalsForm
          action={saveGoals}
          matchId={matchId}
          team1Players={team1Players}
          team2Players={team2Players}
        />
      </section>
    </main>
  );
}
