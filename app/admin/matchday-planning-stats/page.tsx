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

  const [participationRows, goalRows, assistRows, mvpRows, badgeRows, profileRows, nextMatchdayRows] = await Promise.all([
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
  const profileByPlayerId = new Map(profileRows.map((row) => [row.playerId, row]));

  const baseByPlayerId = new Map<
    number,
    {
      games: number;
      wins: number;
      draws: number;
      losses: number;
      goals: number;
      assists: number;
      scorers: number;
      mvps: number;
      badges: number;
      winRate: number;
      goalsPerGame: number;
      assistsPerGame: number;
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
      assists: assistsByPlayerId.get(player.id) ?? 0,
      scorers: 0,
      mvps: mvpsByPlayerId.get(player.id) ?? 0,
      badges: badgesByPlayerId.get(player.id) ?? 0,
      winRate: 0,
      goalsPerGame: 0,
      assistsPerGame: 0,
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
    entry.scorerPerGame = entry.games > 0 ? entry.scorers / entry.games : 0;
    entry.balanceScore =
      entry.mvps * 3 +
      entry.scorerPerGame * 2 +
      entry.winRate / 20 +
      (entry.profile.isStarPlayer ? 1.5 : 0) -
      (entry.profile.isWeakPlayer ? 1.5 : 0);

    return {
      playerId: player.id,
      playerName: player.name,
      ...entry,
    };
  });

  const plannedParticipantIdSet = new Set(nextMatchdayRows.map((row) => row.playerId));
  const plannedParticipantStats = playerStats.filter((entry) => plannedParticipantIdSet.has(entry.playerId));

  function buildSectionStats(source: typeof playerStats) {
    const topMvpPlayers = [...source]
      .sort((a, b) => b.mvps - a.mvps || b.scorers - a.scorers || a.playerName.localeCompare(b.playerName, "de"))
      .slice(0, 5)
      .filter((entry) => entry.mvps > 0);

    const topScorerPlayers = [...source]
      .sort((a, b) => b.scorers - a.scorers || b.goals - a.goals || a.playerName.localeCompare(b.playerName, "de"))
      .slice(0, 5)
      .filter((entry) => entry.scorers > 0);

    return {
      countPlayers: source.length,
      stars: source.filter((entry) => entry.profile.isStarPlayer).length,
      needsSupport: source.filter((entry) => entry.profile.isWeakPlayer).length,
      offensive: source.filter((entry) => entry.profile.isOffensive).length,
      defensive: source.filter((entry) => entry.profile.isDefensive).length,
      avgBalanceScore:
        source.length > 0 ? source.reduce((sum, entry) => sum + entry.balanceScore, 0) / source.length : 0,
      topMvpPlayers,
      topScorerPlayers,
    };
  }

  const allPlayersStats = buildSectionStats(playerStats);
  const plannedPlayersStats = buildSectionStats(plannedParticipantStats);

  const bestWinratePlayers = [...playerStats]
    .filter((entry) => entry.games >= 3)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.playerName.localeCompare(b.playerName, "de"))
    .slice(0, 5);

  async function savePlanningProfile(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const playerId = Number(formData.get("playerId"));
    if (!Number.isInteger(playerId)) {
      throw new Error("Ungültige Spieler-ID");
    }

    const notesValue = String(formData.get("notes") ?? "").trim();

    await db
      .insert(playerPlanningProfiles)
      .values({
        playerId,
        isRunner: formData.get("isRunner") === "on",
        isDefensive: formData.get("isDefensive") === "on",
        isOffensive: formData.get("isOffensive") === "on",
        isWeakPlayer: formData.get("isWeakPlayer") === "on",
        isStarPlayer: formData.get("isStarPlayer") === "on",
        notes: notesValue.length > 0 ? notesValue : null,
      })
      .onConflictDoUpdate({
        target: playerPlanningProfiles.playerId,
        set: {
          isRunner: formData.get("isRunner") === "on",
          isDefensive: formData.get("isDefensive") === "on",
          isOffensive: formData.get("isOffensive") === "on",
          isWeakPlayer: formData.get("isWeakPlayer") === "on",
          isStarPlayer: formData.get("isStarPlayer") === "on",
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

        <section className="mt-6 space-y-4">
          {[
            { title: "Alle Spieler", stats: allPlayersStats },
            { title: "Geplante Teilnehmer nächster Spieltag", stats: plannedPlayersStats },
          ].map((section) => (
            <div key={section.title} className="rounded-2xl border border-zinc-300 bg-stone-50 p-4">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Anzahl Spieler: <strong>{section.stats.countPlayers}</strong></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Sternspieler: <strong>{section.stats.stars}</strong></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Brauchen stärkere Mitspieler: <strong>{section.stats.needsSupport}</strong></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Ø Balance Score: <strong>{section.stats.avgBalanceScore.toFixed(2)}</strong></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Eher offensiv: <strong>{section.stats.offensive}</strong></div>
                <div className="rounded-lg border border-zinc-300 bg-white p-3 text-sm">Eher defensiv: <strong>{section.stats.defensive}</strong></div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <article className="rounded-xl border border-zinc-300 bg-white p-3">
                  <h3 className="text-sm font-semibold">Top-MVP-Spieler</h3>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                    {section.stats.topMvpPlayers.length === 0
                      ? <li>Keine Daten</li>
                      : section.stats.topMvpPlayers.map((p) => <li key={`${section.title}-mvp-${p.playerId}`}>{p.playerName} · {p.mvps}</li>)}
                  </ul>
                </article>
                <article className="rounded-xl border border-zinc-300 bg-white p-3">
                  <h3 className="text-sm font-semibold">Top-Scorer</h3>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                    {section.stats.topScorerPlayers.length === 0
                      ? <li>Keine Daten</li>
                      : section.stats.topScorerPlayers.map((p) => <li key={`${section.title}-scorer-${p.playerId}`}>{p.playerName} · {p.scorers}</li>)}
                  </ul>
                </article>
                <article className="rounded-xl border border-zinc-300 bg-white p-3">
                  <h3 className="text-sm font-semibold">Beste Winrate (mind. 3 Spiele)</h3>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                    {bestWinratePlayers.length === 0 ? <li>Keine Daten</li> : bestWinratePlayers.map((p) => <li key={`wr-${p.playerId}`}>{p.playerName} · {p.winRate.toFixed(1)}%</li>)}
                  </ul>
                </article>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-300 bg-white">
          <table className="min-w-[1300px] w-full text-sm">
            <thead className="bg-stone-50 text-zinc-700">
              <tr>
                <th className="px-3 py-2 text-left">Spieler</th>
                <th className="px-3 py-2 text-left">Spiele</th>
                <th className="px-3 py-2 text-left">Siege</th>
                <th className="px-3 py-2 text-left">Niederlagen</th>
                <th className="px-3 py-2 text-left">Unentschieden</th>
                <th className="px-3 py-2 text-left">Winrate</th>
                <th className="px-3 py-2 text-left">Tore</th>
                <th className="px-3 py-2 text-left">Assists</th>
                <th className="px-3 py-2 text-left">Scorer</th>
                <th className="px-3 py-2 text-left">Tore/Spiel</th>
                <th className="px-3 py-2 text-left">Assists/Spiel</th>
                <th className="px-3 py-2 text-left">MVP</th>
                <th className="px-3 py-2 text-left">Badges</th>
                <th className="px-3 py-2 text-left">Balance Score (intern)</th>
                <th className="px-3 py-2 text-left">Planungsprofil</th>
              </tr>
            </thead>
            <tbody>
              {playerStats.map((entry) => (
                <tr key={entry.playerId} className="border-t border-zinc-300 align-top">
                  <td className="px-3 py-2 font-medium">{entry.playerName}</td>
                  <td className="px-3 py-2">{entry.games}</td>
                  <td className="px-3 py-2">{entry.wins}</td>
                  <td className="px-3 py-2">{entry.losses}</td>
                  <td className="px-3 py-2">{entry.draws}</td>
                  <td className="px-3 py-2">{entry.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{entry.goals}</td>
                  <td className="px-3 py-2">{entry.assists}</td>
                  <td className="px-3 py-2">{entry.scorers}</td>
                  <td className="px-3 py-2">{entry.goalsPerGame.toFixed(2)}</td>
                  <td className="px-3 py-2">{entry.assistsPerGame.toFixed(2)}</td>
                  <td className="px-3 py-2">{entry.mvps}</td>
                  <td className="px-3 py-2">{entry.badges}</td>
                  <td className="px-3 py-2">{entry.balanceScore.toFixed(2)}</td>
                  <td className="px-3 py-2 min-w-[360px]">
                    <form
                      action={async (formData) => {
                        "use server";
                        await savePlanningProfile(formData);
                      }}
                      className="space-y-2 rounded-lg border border-zinc-300 bg-stone-50 p-2"
                    >
                      <input type="hidden" name="playerId" value={entry.playerId} />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="flex items-center gap-2"><input type="checkbox" name="isRunner" defaultChecked={entry.profile.isRunner} /> Läufer</label>
                        <label className="flex items-center gap-2"><input type="checkbox" name="isDefensive" defaultChecked={entry.profile.isDefensive} /> eher defensiv</label>
                        <label className="flex items-center gap-2"><input type="checkbox" name="isOffensive" defaultChecked={entry.profile.isOffensive} /> eher offensiv</label>
                        <label className="flex items-center gap-2"><input type="checkbox" name="isWeakPlayer" defaultChecked={entry.profile.isWeakPlayer} /> braucht stärkere Mitspieler</label>
                        <label className="flex items-center gap-2"><input type="checkbox" name="isStarPlayer" defaultChecked={entry.profile.isStarPlayer} /> Sternspieler</label>
                      </div>
                      <textarea
                        name="notes"
                        defaultValue={entry.profile.notes ?? ""}
                        rows={2}
                        placeholder="Interne Notiz"
                        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs hover:border-zinc-500"
                      >
                        Speichern
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
