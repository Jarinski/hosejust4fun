import Link from "next/link";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  goalEvents,
  matchdayParticipants,
  matchdays,
  matchParticipants,
  matches,
  playerBadges,
  playerPlanningProfiles,
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
            playerId: matchParticipants.playerId,
            teamSide: matchParticipants.teamSide,
            team1Score: matches.team1Score,
            team2Score: matches.team2Score,
          })
          .from(matchParticipants)
          .innerJoin(matches, eq(matchParticipants.matchId, matches.id))
          .where(inArray(matchParticipants.playerId, playerIds))
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
            playerId: matchParticipants.playerId,
            count: sql<number>`count(${goalEvents.id})`,
          })
          .from(matchParticipants)
          .innerJoin(goalEvents, and(eq(goalEvents.matchId, matchParticipants.matchId), eq(goalEvents.teamSide, matchParticipants.teamSide)))
          .where(inArray(matchParticipants.playerId, playerIds))
          .groupBy(matchParticipants.playerId)
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
      </section>
    </main>
  );
}
