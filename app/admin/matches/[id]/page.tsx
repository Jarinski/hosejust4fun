import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players } from "@/src/db/schema";
import { updateMatchMVP } from "./actions";

type TeamSide = "team_1" | "team_2";

function getMatchSummaryText({
  team1Name,
  team2Name,
  team1Goals,
  team2Goals,
  totalGoals,
  leadChanges,
  cameFromBehind,
}: {
  team1Name: string;
  team2Name: string;
  team1Goals: number;
  team2Goals: number;
  totalGoals: number;
  leadChanges: number;
  cameFromBehind: boolean;
}) {
  const winnerName =
    team1Goals > team2Goals ? team1Name : team2Goals > team1Goals ? team2Name : null;
  const margin = Math.abs(team1Goals - team2Goals);

  const opening = winnerName
    ? `${winnerName} gewinnt mit ${team1Goals}:${team2Goals}.`
    : `Das Spiel endet ${team1Goals}:${team2Goals} unentschieden.`;

  const tempo =
    totalGoals >= 8
      ? "Ein echtes Torfestival mit viel Offensivpower auf beiden Seiten."
      : totalGoals <= 3
        ? "Eine eher kontrollierte Partie mit wenigen klaren Abschlüssen."
        : "Ein intensives Spiel mit mehreren starken Offensivmomenten.";

  const drama =
    leadChanges >= 2
      ? `Mit ${leadChanges} Führungswechseln war durchgehend Spannung drin.`
      : leadChanges === 1
        ? "Die Führung wechselte einmal – danach blieb es bis zum Schluss eng."
        : margin >= 3
          ? "Der Sieger konnte sich früh absetzen und den Vorsprung souverän verwalten."
          : "Lange offen, mit Entscheidung in den entscheidenden Szenen.";

  const comeback = cameFromBehind
    ? "Bemerkenswert: Der Sieger lag zuerst hinten und drehte das Spiel." : "";

  return [opening, tempo, drama, comeback].filter(Boolean).join(" ");
}

export default async function MatchDetailPage({
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

  let mvpColumnAvailable = true;
  let matchRows: Array<{
    id: number;
    matchDate: Date;
    team1Name: string;
    team2Name: string;
    mvpPlayerId: number | null;
  }> = [];

  try {
    matchRows = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
        mvpPlayerId: matches.mvpPlayerId,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
  } catch {
    mvpColumnAvailable = false;
    const baseMatchRows = await db
      .select({
        id: matches.id,
        matchDate: matches.matchDate,
        team1Name: matches.team1Name,
        team2Name: matches.team2Name,
      })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);

    matchRows = baseMatchRows.map((match) => ({
      ...match,
      mvpPlayerId: null,
    }));
  }

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

  async function saveMVP(formData: FormData) {
    "use server";

    if (!mvpColumnAvailable) {
      redirect(`/admin/matches/${routeParams.id}?error=1`);
    }

    const submittedMatchId = Number(formData.get("matchId"));
    if (!Number.isInteger(submittedMatchId)) {
      redirect(`/admin/matches/${routeParams.id}?error=1`);
    }

    const mvpPlayerIdRaw = String(formData.get("mvpPlayerId") ?? "").trim();
    const mvpPlayerId = mvpPlayerIdRaw ? Number(mvpPlayerIdRaw) : null;

    try {
      await updateMatchMVP(submittedMatchId, mvpPlayerId);
      redirect(`/admin/matches/${submittedMatchId}?success=1`);
    } catch {
      redirect(`/admin/matches/${submittedMatchId}?error=1`);
    }
  }

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

  const totalGoals = team1Goals + team2Goals;

  const goalsByScorer = new Map<string, number>();
  const assistsTotal = sortedGoals.filter((goal) => goal.assistPlayerId !== null).length;

  for (const goal of sortedGoals) {
    const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
    goalsByScorer.set(scorerName, (goalsByScorer.get(scorerName) ?? 0) + 1);
  }

  const topScorerEntry = [...goalsByScorer.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const firstScoringTeam = sortedGoals[0]?.teamSide ?? null;

  const timelineState = sortedGoals.reduce(
    (acc, goal) => {
      const team1 = acc.team1 + (goal.teamSide === "team_1" ? 1 : 0);
      const team2 = acc.team2 + (goal.teamSide === "team_2" ? 1 : 0);

      const leader: TeamSide | null = team1 > team2 ? "team_1" : team2 > team1 ? "team_2" : null;

      const leadChanges =
        acc.previousLeader && leader && acc.previousLeader !== leader
          ? acc.leadChanges + 1
          : acc.leadChanges;

      return {
        team1,
        team2,
        previousLeader: leader,
        leadChanges,
        goals: [...acc.goals, { ...goal, scoreAfterGoal: `${team1}:${team2}` }],
      };
    },
    {
      team1: 0,
      team2: 0,
      previousLeader: null as TeamSide | null,
      leadChanges: 0,
      goals: [] as Array<(typeof sortedGoals)[number] & { scoreAfterGoal: string }>,
    }
  );

  const leadChanges = timelineState.leadChanges;
  const timelineGoals = timelineState.goals;

  const winnerSide: TeamSide | null =
    team1Goals > team2Goals ? "team_1" : team2Goals > team1Goals ? "team_2" : null;
  const cameFromBehind = Boolean(winnerSide && firstScoringTeam && winnerSide !== firstScoringTeam);

  const insights: string[] = [];

  if (topScorerEntry) {
    if (topScorerEntry[1] >= 3) {
      insights.push(`🎩 Hattrick von ${topScorerEntry[0]} (${topScorerEntry[1]} Tore).`);
    } else if (topScorerEntry[1] >= 2) {
      insights.push(`⚽ Doppelpack von ${topScorerEntry[0]} (${topScorerEntry[1]} Tore).`);
    }
  }

  if (totalGoals >= 8) {
    insights.push(`🔥 Offensivfeuerwerk mit ${totalGoals} Toren.`);
  } else if (totalGoals <= 3) {
    insights.push(`🧱 Defensiv geprägte Partie mit nur ${totalGoals} Treffern.`);
  }

  if (assistsTotal === 0 && totalGoals > 0) {
    insights.push("🎯 Alle Tore entstanden ohne direkte Vorlage.");
  } else if (totalGoals > 0 && assistsTotal / totalGoals >= 0.7) {
    insights.push(`🤝 Starkes Kombinationsspiel: ${assistsTotal} von ${totalGoals} Toren mit Assist.`);
  }

  if (leadChanges >= 2) {
    insights.push(`🔄 ${leadChanges} Führungswechsel – pure Spannung.`);
  }

  if (cameFromBehind && winnerSide) {
    const winnerName = winnerSide === "team_1" ? match.team1Name : match.team2Name;
    insights.push(`📈 Starke Moral: ${winnerName} drehte das Spiel nach frühem Rückstand.`);
  }

  if (match.mvpPlayerId !== null) {
    insights.push(`🏆 MVP: ${playerNameById.get(match.mvpPlayerId) ?? `Spieler #${match.mvpPlayerId}`}.`);
  }

  const summaryText = getMatchSummaryText({
    team1Name: match.team1Name,
    team2Name: match.team2Name,
    team1Goals,
    team2Goals,
    totalGoals,
    leadChanges,
    cameFromBehind,
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <p className="mb-4 text-sm text-zinc-300">
        <Link href="/admin/matches" className="hover:text-white">← Zurück zur Match-Liste</Link>
      </p>

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Match Insight</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          {match.team1Name} <span className="text-red-400">{team1Goals}:{team2Goals}</span> {match.team2Name}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">{match.matchDate.toLocaleDateString("de-DE")}</p>
        <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-200">
          {summaryText}
        </p>
      </section>

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="mb-3 text-lg font-semibold">Insights</h2>
        {insights.length === 0 ? (
          <p className="text-sm text-zinc-400">Noch keine Insights verfügbar.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {insights.slice(0, 5).map((insight, index) => (
              <li key={`${insight}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                {insight}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <h2 className="mb-2 font-semibold">MVP</h2>
        <p className="mb-3 text-zinc-200">
          {match.mvpPlayerId !== null
            ? `MVP: ${playerNameById.get(match.mvpPlayerId) ?? `Spieler #${match.mvpPlayerId}`} 🏆`
            : "Kein MVP vergeben"}
        </p>

        {!mvpColumnAvailable ? (
          <p className="mb-3 text-sm text-amber-300">
            MVP ist in dieser Datenbank noch nicht verfügbar (Migration fehlt).
          </p>
        ) : null}

        {queryParams.success === "1" ? (
          <p className="mb-3 text-green-400">MVP wurde gespeichert.</p>
        ) : null}

        {queryParams.error === "1" ? (
          <p className="mb-3 text-red-400">MVP konnte nicht gespeichert werden.</p>
        ) : null}

        {mvpColumnAvailable ? (
          <form action={saveMVP} className="flex flex-col gap-3 max-w-md">
            <input type="hidden" name="matchId" value={matchId} />
            <label className="flex flex-col gap-1">
              <span className="text-sm text-zinc-300">MVP auswählen</span>
              <select
                name="mvpPlayerId"
                defaultValue={match.mvpPlayerId !== null ? String(match.mvpPlayerId) : ""}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              >
                <option value="">Kein MVP</option>
                {participantRows.map((participant) => (
                  <option key={participant.playerId} value={participant.playerId}>
                    {participant.playerName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="w-fit rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 hover:border-zinc-500"
            >
              Speichern
            </button>
          </form>
        ) : null}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <h2 className="mb-2 font-medium">{match.team1Name}</h2>
          <ul className="list-disc pl-5 text-zinc-200">
            {team1Participants.length === 0 ? <li>Keine Spieler</li> : null}
            {team1Participants.map((participant) => (
              <li key={participant.id}>{participant.playerName}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <h2 className="mb-2 font-medium">{match.team2Name}</h2>
          <ul className="list-disc pl-5 text-zinc-200">
            {team2Participants.length === 0 ? <li>Keine Spieler</li> : null}
            {team2Participants.map((participant) => (
              <li key={participant.id}>{participant.playerName}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/admin/matches/${match.id}/participants`}
            className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 hover:border-zinc-500"
          >
            Teilnehmer bearbeiten
          </Link>
          <Link
            href={`/admin/matches/${match.id}/goals`}
            className="rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 hover:border-zinc-500"
          >
            Tore bearbeiten
          </Link>
        </div>

        <h2 className="mb-2 font-medium">Tor-Timeline</h2>
        <ul className="space-y-2 text-sm">
          {timelineGoals.length === 0 ? <li className="text-zinc-400">Keine Tore erfasst.</li> : null}
          {timelineGoals.map((goal) => {
            const scorerName = playerNameById.get(goal.scorerPlayerId) ?? `Spieler #${goal.scorerPlayerId}`;
            const assistName =
              goal.assistPlayerId !== null
                ? (playerNameById.get(goal.assistPlayerId) ?? `Spieler #${goal.assistPlayerId}`)
                : null;
            const teamName = goal.teamSide === "team_1" ? match.team1Name : match.team2Name;

            return (
              <li key={goal.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                <span className="font-semibold text-red-300">{goal.minute !== null ? `${goal.minute}'. ` : "• "}</span>
                {teamName}: <span className="font-medium text-zinc-100">{scorerName}</span>
                {assistName ? ` (Vorlage: ${assistName})` : ""}
                {goal.goalType ? ` [${goal.goalType}]` : ""}
                <span className="ml-2 text-zinc-400">Zwischenstand {goal.scoreAfterGoal}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}