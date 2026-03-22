import { asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/src/db";
import {
  matchParticipants,
  matchdayParticipants,
  matchdays,
  matches,
  players,
} from "@/src/db/schema";
import { buildMatchdayForecast } from "@/src/lib/matchdayForecast";
import {
  fetchWeatherForMatchDate,
  getUpcomingMondayIsoInBerlin,
} from "@/src/lib/weather";
import { getWeatherPresentation } from "@/src/lib/weatherIcons";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";

async function ensureMatchdayTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "matchdays" (
      "id" serial PRIMARY KEY,
      "match_date" date NOT NULL UNIQUE,
      "location" text,
      "created_at" timestamp DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "matchday_participants" (
      "id" serial PRIMARY KEY,
      "matchday_id" integer NOT NULL REFERENCES "matchdays"("id"),
      "player_id" integer NOT NULL REFERENCES "players"("id"),
      "created_at" timestamp DEFAULT now()
    )
  `);
}

function formatIsoDate(isoDate: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "full",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${isoDate}T00:00:00`));
}

export default async function MatchdayPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdmin("/spieltag");
  await ensureMatchdayTables();

  const queryParams = await searchParams;
  const upcomingMondayIso = getUpcomingMondayIsoInBerlin();

  const [activePlayers, weather] = await Promise.all([
    db
      .select({ id: players.id, name: players.name })
      .from(players)
      .where(eq(players.isActive, true))
      .orderBy(asc(players.name)),
    fetchWeatherForMatchDate(upcomingMondayIso).catch(() => ({
      conditionLabel: "Wetterdaten nicht verfügbar",
      temperatureC: null,
      feelsLikeC: null,
      precipMm: null,
      windKmh: null,
      humidityPct: null,
    })),
  ]);

  const matchdayRows = await db
    .select({ id: matchdays.id })
    .from(matchdays)
    .where(eq(matchdays.matchDate, upcomingMondayIso))
    .limit(1);

  const matchdayId = matchdayRows[0]?.id ?? null;

  const selectedPlayerIds =
    matchdayId !== null
      ? await db
          .select({ playerId: matchdayParticipants.playerId })
          .from(matchdayParticipants)
          .where(eq(matchdayParticipants.matchdayId, matchdayId))
          .then((rows) => rows.map((row) => row.playerId))
      : [];

  const selectedSet = new Set(selectedPlayerIds);
  const selectedPlayers = activePlayers.filter((player) => selectedSet.has(player.id));

  const selectedIds = selectedPlayers.map((player) => player.id);

  const historicalMatches = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
    })
    .from(matches)
    .where(lt(matches.matchDate, new Date(`${upcomingMondayIso}T23:59:59`)))
    .orderBy(desc(matches.matchDate), desc(matches.id));

  const historicalMatchIds = historicalMatches.map((match) => match.id);

  const historicalParticipants =
    historicalMatchIds.length > 0
      ? await db
          .select({
            matchId: matchParticipants.matchId,
            playerId: matchParticipants.playerId,
            teamSide: matchParticipants.teamSide,
          })
          .from(matchParticipants)
          .where(inArray(matchParticipants.matchId, historicalMatchIds))
      : [];

  const playerNameById = new Map(activePlayers.map((player) => [player.id, player.name]));

  const participantIdsByMatch = new Map<number, Set<number>>();
  for (const row of historicalParticipants) {
    const existing = participantIdsByMatch.get(row.matchId) ?? new Set<number>();
    existing.add(row.playerId);
    participantIdsByMatch.set(row.matchId, existing);
  }

  const returningPlayers = selectedPlayers
    .map((player) => {
      let missed = 0;

      for (const match of historicalMatches) {
        const participantIds = participantIdsByMatch.get(match.id) ?? new Set<number>();
        if (participantIds.has(player.id)) {
          break;
        }
        missed += 1;
      }

      return {
        name: player.name,
        missedMatches: missed,
      };
    })
    .filter((entry) => entry.missedMatches >= 2)
    .sort((a, b) => b.missedMatches - a.missedMatches);

  type DuoStats = {
    gamesTogether: number;
    winsTogether: number;
  };

  const duoStatsByKey = new Map<string, DuoStats>();

  for (const match of historicalMatches) {
    const team1 = historicalParticipants
      .filter((participant) => participant.matchId === match.id && participant.teamSide === "team_1")
      .map((participant) => participant.playerId)
      .sort((a, b) => a - b);

    const team2 = historicalParticipants
      .filter((participant) => participant.matchId === match.id && participant.teamSide === "team_2")
      .map((participant) => participant.playerId)
      .sort((a, b) => a - b);

    const team1Won = match.team1Score > match.team2Score;
    const team2Won = match.team2Score > match.team1Score;

    const processTeam = (playerIds: number[], won: boolean) => {
      for (let i = 0; i < playerIds.length; i += 1) {
        for (let j = i + 1; j < playerIds.length; j += 1) {
          const a = playerIds[i]!;
          const b = playerIds[j]!;
          const key = `${a}-${b}`;
          const prev = duoStatsByKey.get(key) ?? { gamesTogether: 0, winsTogether: 0 };
          duoStatsByKey.set(key, {
            gamesTogether: prev.gamesTogether + 1,
            winsTogether: prev.winsTogether + (won ? 1 : 0),
          });
        }
      }
    };

    processTeam(team1, team1Won);
    processTeam(team2, team2Won);
  }

  const strongestDuo = selectedIds.length >= 2
    ? Array.from(duoStatsByKey.entries())
        .map(([key, stats]) => {
          const [aRaw, bRaw] = key.split("-");
          const a = Number(aRaw);
          const b = Number(bRaw);
          return { a, b, ...stats };
        })
        .filter(
          (duo) =>
            selectedSet.has(duo.a) &&
            selectedSet.has(duo.b) &&
            duo.gamesTogether >= 2
        )
        .map((duo) => ({
          playerAName: playerNameById.get(duo.a) ?? `Spieler #${duo.a}`,
          playerBName: playerNameById.get(duo.b) ?? `Spieler #${duo.b}`,
          gamesTogether: duo.gamesTogether,
          winsTogether: duo.winsTogether,
          winRatePct: Math.round((duo.winsTogether / duo.gamesTogether) * 100),
        }))
        .sort((a, b) => {
          if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
          if (b.gamesTogether !== a.gamesTogether) return b.gamesTogether - a.gamesTogether;
          return a.playerAName.localeCompare(b.playerAName, "de");
        })[0] ?? null
    : null;

  const weatherPresentation = getWeatherPresentation({
    conditionLabel: weather.conditionLabel,
    temperatureC: weather.temperatureC,
    precipMm: weather.precipMm,
    windKmh: weather.windKmh,
  });

  const forecastLines = buildMatchdayForecast({
    selectedPlayers,
    weather,
    strongestDuo,
    returningPlayers,
  });

  async function saveMatchdayParticipants(formData: FormData) {
    "use server";

    await requireAdminInAction();
    await ensureMatchdayTables();

    const targetDateRaw = String(formData.get("matchDate") ?? "").trim();

    if (!targetDateRaw) {
      redirect("/spieltag?error=1");
    }

    const playerRows = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.isActive, true));

    const selectedIdsToSave: number[] = [];
    for (const player of playerRows) {
      const value = formData.get(`player_${player.id}`);
      if (value === "on") {
        selectedIdsToSave.push(player.id);
      }
    }

    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: matchdays.id })
          .from(matchdays)
          .where(eq(matchdays.matchDate, targetDateRaw))
          .limit(1);

        const ensuredMatchdayId =
          existing[0]?.id ??
          (
            await tx
              .insert(matchdays)
              .values({
                matchDate: targetDateRaw,
                location: "Holm-Seppensen",
              })
              .returning({ id: matchdays.id })
          )[0]?.id;

        if (!ensuredMatchdayId) {
          throw new Error("Spieltag konnte nicht angelegt werden");
        }

        await tx
          .delete(matchdayParticipants)
          .where(eq(matchdayParticipants.matchdayId, ensuredMatchdayId));

        if (selectedIdsToSave.length > 0) {
          await tx.insert(matchdayParticipants).values(
            selectedIdsToSave.map((playerId) => ({
              matchdayId: ensuredMatchdayId,
              playerId,
            }))
          );
        }
      });
    } catch {
      redirect("/spieltag?error=1");
    }

    redirect("/spieltag?success=1");
  }

  return (
    <main className="min-h-screen bg-stone-100 p-6 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-zinc-300 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Matchday Check-In
            </p>
            <h1 className="mt-1 text-2xl font-bold">Spieltag planen</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Teilnehmer eintragen und den kleinen HoSe-Forecast für den nächsten Montag ansehen.
            </p>
          </div>
          <span className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] uppercase tracking-wider text-zinc-600">
            {formatIsoDate(upcomingMondayIso)}
          </span>
        </div>

        {queryParams.success === "1" ? (
          <p className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Teilnahme gespeichert.
          </p>
        ) : null}

        {queryParams.error === "1" ? (
          <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Teilnahme konnte nicht gespeichert werden.
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <h2 className="text-lg font-semibold">Wer ist dabei?</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Ohne Teameinteilung – einfach nur Zusage für den Spieltag setzen.
            </p>

            <form action={saveMatchdayParticipants} className="mt-4 flex flex-col gap-2.5">
              <input type="hidden" name="matchDate" value={upcomingMondayIso} />

              {activePlayers.map((player) => (
                <label
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-white px-3 py-2.5"
                >
                  <span className="text-sm text-zinc-800">{player.name}</span>
                  <input
                    type="checkbox"
                    name={`player_${player.id}`}
                    defaultChecked={selectedSet.has(player.id)}
                    className="h-4 w-4 accent-zinc-900"
                  />
                </label>
              ))}

              <button
                type="submit"
                className="mt-2 w-fit rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm hover:border-zinc-500"
              >
                Teilnahme speichern
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-zinc-300 bg-stone-50 p-4">
            <h2 className="text-lg font-semibold">Forecast</h2>
            <p className="mt-1 text-sm text-zinc-600">Wetter + Historie + etwas Redaktionshumor.</p>

            <article className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-3">
              <p className="text-sm font-medium text-zinc-900">
                {weatherPresentation.icon} {weatherPresentation.label}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Temperatur: {weather.temperatureC !== null ? `${weather.temperatureC.toFixed(1)} °C` : "—"}
                {" · "}
                Gefühlte Temp.: {weather.feelsLikeC !== null ? `${weather.feelsLikeC.toFixed(1)} °C` : "—"}
                {" · "}
                Niederschlag: {weather.precipMm !== null ? `${weather.precipMm.toFixed(1)} mm` : "—"}
              </p>
            </article>

            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {forecastLines.map((line, index) => (
                <li key={`${line}-${index}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
