import Link from "next/link";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  matchdayParticipants,
  matchdays,
  matchParticipantPrimary,
  matches,
  playerBadges,
  playerPlanningProfiles,
  matchdayTeamSuggestionPlayers,
  matchdayTeamSuggestions,
  players,
} from "@/src/db/schema";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";
import { getUpcomingMondayIsoInBerlin } from "@/src/lib/weather";

type PlanningPageProps = {
  searchParams: Promise<{ updated?: string }>;
};

type PlayerBase = { id: number; name: string };

type PlanningProfile = {
  playerId: number;
  isRunner: boolean;
  isDefensive: boolean;
  isOffensive: boolean;
  isWeakPlayer: boolean;
  isStarPlayer: boolean;
  notes: string | null;
};

type PlayerType = "star" | "solid" | "development";
type SuggestionTeamSide = "team_a" | "team_b";

function getPlayerType(profile: PlanningProfile): PlayerType {
  if (profile.isStarPlayer) return "star";
  if (profile.isWeakPlayer) return "development";
  return "solid";
}

function getPlayerTypeLabel(playerType: PlayerType): string {
  if (playerType === "star") return "Sternspieler";
  if (playerType === "development") return "Ausbauspieler";
  return "Solider Spieler";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getBalanceScoreLabel(score: number): string {
  if (score >= 85) return "Topspieler";
  if (score >= 70) return "Stark";
  if (score >= 50) return "Solide";
  if (score >= 40) return "Wackelig";
  return "Ausbaubereich";
}

function getBalanceScoreLabelClassName(score: number): string {
  if (score >= 85) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (score >= 70) return "border-lime-300 bg-lime-50 text-lime-800";
  if (score >= 50) return "border-zinc-300 bg-zinc-50 text-zinc-700";
  if (score >= 40) return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-orange-300 bg-orange-50 text-orange-800";
}

function formatSuggestionDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function MatchdayPlanningStatsPage({ searchParams }: PlanningPageProps) {
  await requireAdmin("/admin/matchday-planning-stats");

  const params = await searchParams;
  const wasUpdated = params.updated === "1";

  const playerRows: PlayerBase[] = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.isActive, true))
    .orderBy(asc(players.name));

  const playerIds = playerRows.map((p) => p.id);
  const upcomingMondayIso = getUpcomingMondayIsoInBerlin();

  const [participationRows, goalRows, assistRows, mvpRows, badgeRows, profileRows, nextMatchdayRows, teamGoalRows] = await Promise.all([
    playerIds.length
      ? db
          .select({
            playerId: matchParticipantPrimary.playerId,
            teamSide: matchParticipantPrimary.teamSide,
            team1Score: matches.team1Score,
            team2Score: matches.team2Score,
          })
          .from(matchParticipantPrimary)
          .innerJoin(matches, eq(matchParticipantPrimary.matchId, matches.id))
          .where(inArray(matchParticipantPrimary.playerId, playerIds))
      : Promise.resolve([] as Array<{ playerId: number; teamSide: "team_1" | "team_2"; team1Score: number; team2Score: number }>),
    playerIds.length
      ? db
          .select({
            playerId: goalEvents.scorerPlayerId,
            count: sql<number>`count(*)`,
          })
          .from(goalEvents)
          .where(and(inArray(goalEvents.scorerPlayerId, playerIds), eq(goalEvents.isOwnGoal, false)))
          .groupBy(goalEvents.scorerPlayerId)
      : Promise.resolve([] as Array<{ playerId: number; count: number }>),
    playerIds.length
      ? db
          .select({
            playerId: goalEvents.assistPlayerId,
            count: sql<number>`count(*)`,
          })
          .from(goalEvents)
          .where(inArray(goalEvents.assistPlayerId, playerIds))
          .groupBy(goalEvents.assistPlayerId)
      : Promise.resolve([] as Array<{ playerId: number | null; count: number }>),
    playerIds.length
      ? db
          .select({
            playerId: matches.mvpPlayerId,
            count: sql<number>`count(*)`,
          })
          .from(matches)
          .where(inArray(matches.mvpPlayerId, playerIds))
          .groupBy(matches.mvpPlayerId)
      : Promise.resolve([] as Array<{ playerId: number | null; count: number }>),
    playerIds.length
      ? db
          .select({
            playerId: playerBadges.playerId,
            count: sql<number>`count(*)`,
          })
          .from(playerBadges)
          .where(inArray(playerBadges.playerId, playerIds))
          .groupBy(playerBadges.playerId)
      : Promise.resolve([] as Array<{ playerId: number; count: number }>),
    playerIds.length
      ? db
          .select({
            playerId: playerPlanningProfiles.playerId,
            isRunner: playerPlanningProfiles.isRunner,
            isDefensive: playerPlanningProfiles.isDefensive,
            isOffensive: playerPlanningProfiles.isOffensive,
            isWeakPlayer: playerPlanningProfiles.isWeakPlayer,
            isStarPlayer: playerPlanningProfiles.isStarPlayer,
            notes: playerPlanningProfiles.notes,
          })
          .from(playerPlanningProfiles)
          .where(inArray(playerPlanningProfiles.playerId, playerIds))
      : Promise.resolve([] as PlanningProfile[]),
    db
      .select({
        playerId: matchdayParticipants.playerId,
      })
      .from(matchdayParticipants)
      .innerJoin(matchdays, eq(matchdayParticipants.matchdayId, matchdays.id))
      .where(and(eq(matchdays.matchDate, upcomingMondayIso), eq(matchdayParticipants.isCanceled, false))),
    playerIds.length
      ? db
          .select({
            playerId: matchParticipantPrimary.playerId,
            count: sql<number>`count(${goalEvents.id})`,
          })
          .from(matchParticipantPrimary)
          .innerJoin(goalEvents, and(eq(goalEvents.matchId, matchParticipantPrimary.matchId), eq(goalEvents.teamSide, matchParticipantPrimary.teamSide)))
          .where(inArray(matchParticipantPrimary.playerId, playerIds))
          .groupBy(matchParticipantPrimary.playerId)
      : Promise.resolve([] as Array<{ playerId: number; count: number }>),
  ]);

  const goalsByPlayerId = new Map(goalRows.map((row) => [row.playerId, Number(row.count) || 0]));
  const assistsByPlayerId = new Map(
    assistRows
      .filter((row) => row.playerId !== null)
      .map((row) => [row.playerId as number, Number(row.count) || 0]),
  );
  const mvpsByPlayerId = new Map(
    mvpRows
      .filter((row) => row.playerId !== null)
      .map((row) => [row.playerId as number, Number(row.count) || 0]),
  );
  const badgesByPlayerId = new Map(badgeRows.map((row) => [row.playerId, Number(row.count) || 0]));
  const teamGoalsByPlayerId = new Map(teamGoalRows.map((row) => [row.playerId, Number(row.count) || 0]));
  const profileByPlayerId = new Map(profileRows.map((row) => [row.playerId, row]));

  const baseByPlayerId = new Map<
    number,
    {
      games: number;
      wins: number;
      draws: number;
      losses: number;
      goals: number;
      teamGoals: number;
      assists: number;
      scorers: number;
      mvps: number;
      badges: number;
      winRate: number;
      goalsPerGame: number;
      assistsPerGame: number;
      teamGoalsPerGame: number;
      scorerPerGame: number;
      balanceScore: number;
      profile: PlanningProfile;
    }
  >();

  for (const player of playerRows) {
    baseByPlayerId.set(player.id, {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: goalsByPlayerId.get(player.id) ?? 0,
      teamGoals: teamGoalsByPlayerId.get(player.id) ?? 0,
      assists: assistsByPlayerId.get(player.id) ?? 0,
      scorers: 0,
      mvps: mvpsByPlayerId.get(player.id) ?? 0,
      badges: badgesByPlayerId.get(player.id) ?? 0,
      winRate: 0,
      goalsPerGame: 0,
      assistsPerGame: 0,
      teamGoalsPerGame: 0,
      scorerPerGame: 0,
      balanceScore: 0,
      profile: profileByPlayerId.get(player.id) ?? {
        playerId: player.id,
        isRunner: false,
        isDefensive: false,
        isOffensive: false,
        isWeakPlayer: false,
        isStarPlayer: false,
        notes: null,
      },
    });
  }

  for (const row of participationRows) {
    const entry = baseByPlayerId.get(row.playerId);
    if (!entry) continue;

    entry.games += 1;
    const teamGoals = row.teamSide === "team_1" ? row.team1Score : row.team2Score;
    const conceded = row.teamSide === "team_1" ? row.team2Score : row.team1Score;
    if (teamGoals > conceded) entry.wins += 1;
    else if (teamGoals === conceded) entry.draws += 1;
    else entry.losses += 1;
  }

  const playerStats = playerRows.map((player) => {
    const entry = baseByPlayerId.get(player.id)!;
    entry.scorers = entry.goals + entry.assists;
    entry.winRate = entry.games > 0 ? (entry.wins / entry.games) * 100 : 0;
    entry.goalsPerGame = entry.games > 0 ? entry.goals / entry.games : 0;
    entry.assistsPerGame = entry.games > 0 ? entry.assists / entry.games : 0;
    entry.teamGoalsPerGame = entry.games > 0 ? entry.teamGoals / entry.games : 0;
    entry.scorerPerGame = entry.games > 0 ? entry.scorers / entry.games : 0;
    const playerType = getPlayerType(entry.profile);
    const roleAdjustment = playerType === "star" ? 3 : playerType === "development" ? -3 : 0;

    const winRate = entry.winRate / 100;
    const gamesConfidence = Math.min(1, entry.games / 5);
    const adjustedWinRate = winRate * gamesConfidence;

    const winRatePoints = adjustedWinRate * 35;
    const goalsPoints = clamp(entry.goalsPerGame / 2, 0, 1) * 25;
    const assistsPoints = clamp(entry.assistsPerGame / 1.5, 0, 1) * 15;
    const teamGoalsPoints = clamp(entry.teamGoalsPerGame / 5, 0, 1) * 15;
    const mvpPoints = clamp(entry.mvps / 5, 0, 1) * 10;

    entry.balanceScore = clamp(
      winRatePoints + goalsPoints + assistsPoints + teamGoalsPoints + mvpPoints + roleAdjustment,
      0,
      100,
    );

    return {
      playerId: player.id,
      playerName: player.name,
      playerType,
      playerTypeLabel: getPlayerTypeLabel(playerType),
      ...entry,
    };
  });

  const plannedParticipantIdSet = new Set(nextMatchdayRows.map((row) => row.playerId));

  const orderedPlayerStats = [...playerStats].sort(
    (a, b) => b.balanceScore - a.balanceScore || b.winRate - a.winRate || a.playerName.localeCompare(b.playerName, "de"),
  );

  const upcomingMatchday = await db
    .select({ id: matchdays.id, matchDate: matchdays.matchDate })
    .from(matchdays)
    .where(eq(matchdays.matchDate, upcomingMondayIso))
    .limit(1);

  const upcomingMatchdayId = upcomingMatchday[0]?.id ?? null;

  const suggestionCandidates = orderedPlayerStats.filter((entry) => plannedParticipantIdSet.has(entry.playerId));
  const teamA: typeof suggestionCandidates = [];
  const teamB: typeof suggestionCandidates = [];

  suggestionCandidates.forEach((entry, index) => {
    const round = Math.floor(index / 2);
    const isEvenRound = round % 2 === 0;
    if (isEvenRound) {
      if (index % 2 === 0) teamA.push(entry);
      else teamB.push(entry);
      return;
    }
    if (index % 2 === 0) teamB.push(entry);
    else teamA.push(entry);
  });

  const teamAScore = teamA.reduce((sum, p) => sum + p.balanceScore, 0);
  const teamBScore = teamB.reduce((sum, p) => sum + p.balanceScore, 0);
  const computedScoreDiff = Math.abs(teamAScore - teamBScore);

  const latestStoredSuggestion = upcomingMatchdayId
    ? await db
        .select({
          id: matchdayTeamSuggestions.id,
          algorithmVersion: matchdayTeamSuggestions.algorithmVersion,
          scoreDiff: matchdayTeamSuggestions.scoreDiff,
          notes: matchdayTeamSuggestions.notes,
          createdAt: matchdayTeamSuggestions.createdAt,
        })
        .from(matchdayTeamSuggestions)
        .where(eq(matchdayTeamSuggestions.matchdayId, upcomingMatchdayId))
        .orderBy(desc(matchdayTeamSuggestions.createdAt), desc(matchdayTeamSuggestions.id))
        .limit(1)
    : [];

  const latestSuggestion = latestStoredSuggestion[0] ?? null;

  const latestSuggestionPlayers = latestSuggestion
    ? await db
        .select({
          playerId: matchdayTeamSuggestionPlayers.playerId,
          teamSide: matchdayTeamSuggestionPlayers.teamSide,
          balanceScoreAtCreation: matchdayTeamSuggestionPlayers.balanceScoreAtCreation,
          playerRoleAtCreation: matchdayTeamSuggestionPlayers.playerRoleAtCreation,
          isRunnerAtCreation: matchdayTeamSuggestionPlayers.isRunnerAtCreation,
          isDefensiveAtCreation: matchdayTeamSuggestionPlayers.isDefensiveAtCreation,
          isOffensiveAtCreation: matchdayTeamSuggestionPlayers.isOffensiveAtCreation,
          playerName: players.name,
        })
        .from(matchdayTeamSuggestionPlayers)
        .innerJoin(players, eq(matchdayTeamSuggestionPlayers.playerId, players.id))
        .where(eq(matchdayTeamSuggestionPlayers.suggestionId, latestSuggestion.id))
    : [];

  const latestTeamA = latestSuggestionPlayers
    .filter((p) => p.teamSide === "team_a")
    .sort((a, b) => Number(b.balanceScoreAtCreation) - Number(a.balanceScoreAtCreation) || a.playerName.localeCompare(b.playerName, "de"));
  const latestTeamB = latestSuggestionPlayers
    .filter((p) => p.teamSide === "team_b")
    .sort((a, b) => Number(b.balanceScoreAtCreation) - Number(a.balanceScoreAtCreation) || a.playerName.localeCompare(b.playerName, "de"));

  async function savePlanningProfile(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const playerId = Number(formData.get("playerId"));
    if (!Number.isInteger(playerId)) {
      throw new Error("Ungültige Spieler-ID");
    }

    const notesValue = String(formData.get("notes") ?? "").trim();
    const selectedPlayerType = String(formData.get("playerType") ?? "solid") as PlayerType;

    const isStarPlayer = selectedPlayerType === "star";
    const isWeakPlayer = selectedPlayerType === "development";

    await db
      .insert(playerPlanningProfiles)
      .values({
        playerId,
        isRunner: formData.get("isRunner") === "on",
        isDefensive: formData.get("isDefensive") === "on",
        isOffensive: formData.get("isOffensive") === "on",
        isWeakPlayer,
        isStarPlayer,
        notes: notesValue.length > 0 ? notesValue : null,
      })
      .onConflictDoUpdate({
        target: playerPlanningProfiles.playerId,
        set: {
          isRunner: formData.get("isRunner") === "on",
          isDefensive: formData.get("isDefensive") === "on",
          isOffensive: formData.get("isOffensive") === "on",
          isWeakPlayer,
          isStarPlayer,
          notes: notesValue.length > 0 ? notesValue : null,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/admin/matchday-planning-stats");
  }

  async function saveTeamSuggestion() {
    "use server";

    await requireAdminInAction();

    if (!upcomingMatchdayId) {
      throw new Error("Kein nächster Spieltag gefunden.");
    }

    const inserted = await db
      .insert(matchdayTeamSuggestions)
      .values({
        matchdayId: upcomingMatchdayId,
        algorithmVersion: "v1_snake_draft",
        scoreDiff: computedScoreDiff.toFixed(2),
      })
      .returning({ id: matchdayTeamSuggestions.id });

    const suggestionId = inserted[0]?.id;
    if (!suggestionId) {
      throw new Error("Teamvorschlag konnte nicht gespeichert werden.");
    }

    const rows = [...teamA.map((player) => ({ player, teamSide: "team_a" as SuggestionTeamSide })), ...teamB.map((player) => ({ player, teamSide: "team_b" as SuggestionTeamSide }))];

    if (rows.length > 0) {
      await db.insert(matchdayTeamSuggestionPlayers).values(
        rows.map(({ player, teamSide }) => ({
          suggestionId,
          playerId: player.playerId,
          teamSide,
          balanceScoreAtCreation: player.balanceScore.toFixed(2),
          playerRoleAtCreation: player.playerType,
          isRunnerAtCreation: player.profile.isRunner,
          isDefensiveAtCreation: player.profile.isDefensive,
          isOffensiveAtCreation: player.profile.isOffensive,
        })),
      );
    }

    revalidatePath("/admin/matchday-planning-stats");
  }

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-7xl rounded-2xl border border-zinc-300 bg-white p-6">
        <p className="mb-4 text-sm text-zinc-600">
          <Link href="/admin/matches" className="hover:text-zinc-900">
            ← Zurück zu Matches
          </Link>
        </p>

        <h1 className="text-2xl font-semibold">Spieltag Planung Stats</h1>
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Interne Planungswerte – nicht öffentlich sichtbar.
        </p>
        {wasUpdated ? <p className="mt-2 text-sm text-green-700">Änderungen gespeichert.</p> : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {orderedPlayerStats.map((entry) => (
            <article key={entry.playerId} className="rounded-2xl border border-zinc-300 bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{entry.playerName}</h2>
                  {plannedParticipantIdSet.has(entry.playerId) ? (
                    <p className="mt-1 inline-block rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                      Geplant für nächsten Spieltag
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-right">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">Balance Score</p>
                  <p className="text-3xl font-bold leading-none text-zinc-900">{entry.balanceScore.toFixed(1)}</p>
                  <p
                    className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${getBalanceScoreLabelClassName(
                      entry.balanceScore,
                    )}`}
                  >
                    {getBalanceScoreLabel(entry.balanceScore)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <div className="rounded-lg border border-zinc-300 bg-white p-2"><p className="text-xs text-zinc-500">Winrate</p><p className="font-semibold">{entry.winRate.toFixed(1)}%</p></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-2"><p className="text-xs text-zinc-500">Tore/Spiel</p><p className="font-semibold">{entry.goalsPerGame.toFixed(2)}</p></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-2"><p className="text-xs text-zinc-500">Assists/Spiel</p><p className="font-semibold">{entry.assistsPerGame.toFixed(2)}</p></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-2"><p className="text-xs text-zinc-500">Teamtore/Spiel</p><p className="font-semibold">{entry.teamGoalsPerGame.toFixed(2)}</p></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-2"><p className="text-xs text-zinc-500">MVP</p><p className="font-semibold">{entry.mvps}</p></div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800">
                  Rolle: {entry.playerTypeLabel}
                </span>
                {entry.profile.isRunner ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs">Runner</span> : null}
                {entry.profile.isOffensive ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs">offensiv</span> : null}
                {entry.profile.isDefensive ? <span className="rounded-full border border-zinc-300 bg-white px-2 py-1 text-xs">defensiv</span> : null}
              </div>

              <form
                action={async (formData) => {
                  "use server";
                  await savePlanningProfile(formData);
                }}
                className="mt-4 space-y-2 rounded-lg border border-zinc-300 bg-white p-3"
              >
                <input type="hidden" name="playerId" value={entry.playerId} />

                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="isRunner" defaultChecked={entry.profile.isRunner} /> Läufer</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="isDefensive" defaultChecked={entry.profile.isDefensive} /> eher defensiv</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="isOffensive" defaultChecked={entry.profile.isOffensive} /> eher offensiv</label>
                </div>

                <label className="block text-xs text-zinc-700">
                  Spielertyp
                  <select
                    name="playerType"
                    defaultValue={entry.playerType}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  >
                    <option value="star">Sternspieler</option>
                    <option value="solid">Solider Spieler</option>
                    <option value="development">Ausbauspieler</option>
                  </select>
                </label>

                <textarea
                  name="notes"
                  defaultValue={entry.profile.notes ?? ""}
                  rows={2}
                  placeholder="Interne Notiz"
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 bg-stone-50 px-2 py-1 text-xs hover:border-zinc-500"
                >
                  Speichern
                </button>
              </form>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-300 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Teamvorschlag (berechnet)</h2>
              <p className="text-sm text-zinc-600">Algorithmus: v1_snake_draft</p>
            </div>
            <form action={saveTeamSuggestion}>
              <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:border-zinc-500">
                Vorschlag speichern
              </button>
            </form>
          </div>

          <p className="mt-2 text-sm text-zinc-700">Score-Differenz: {computedScoreDiff.toFixed(2)}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-zinc-300 bg-white p-3">
              <h3 className="font-medium">Team A</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {teamA.map((player) => (
                  <li key={`a-${player.playerId}`} className="flex justify-between gap-2">
                    <span>{player.playerName}</span>
                    <span className="text-zinc-600">{player.balanceScore.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-xl border border-zinc-300 bg-white p-3">
              <h3 className="font-medium">Team B</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {teamB.map((player) => (
                  <li key={`b-${player.playerId}`} className="flex justify-between gap-2">
                    <span>{player.playerName}</span>
                    <span className="text-zinc-600">{player.balanceScore.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-300 bg-stone-50 p-4">
          <h2 className="text-lg font-semibold">Zuletzt gespeicherter Teamvorschlag</h2>
          {!latestSuggestion ? (
            <p className="mt-2 text-sm text-zinc-700">Noch kein gespeicherter Teamvorschlag vorhanden.</p>
          ) : (
            <>
              <div className="mt-2 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                <p><span className="font-medium">Erstellt:</span> {formatSuggestionDate(latestSuggestion.createdAt)}</p>
                <p><span className="font-medium">Algorithmus-Version:</span> {latestSuggestion.algorithmVersion}</p>
                <p><span className="font-medium">Score-Differenz:</span> {Number(latestSuggestion.scoreDiff).toFixed(2)}</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-zinc-300 bg-white p-3">
                  <h3 className="font-medium">Team A</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {latestTeamA.map((player) => (
                      <li key={`latest-a-${player.playerId}`} className="flex justify-between gap-2">
                        <span>{player.playerName}</span>
                        <span className="text-zinc-600">{Number(player.balanceScoreAtCreation).toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="rounded-xl border border-zinc-300 bg-white p-3">
                  <h3 className="font-medium">Team B</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {latestTeamB.map((player) => (
                      <li key={`latest-b-${player.playerId}`} className="flex justify-between gap-2">
                        <span>{player.playerName}</span>
                        <span className="text-zinc-600">{Number(player.balanceScoreAtCreation).toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
