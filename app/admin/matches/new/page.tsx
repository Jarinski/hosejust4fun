import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matches, matchWeather, seasons } from "@/src/db/schema";
import { requireAdmin, requireAdminInAction } from "@/src/lib/auth";
import { fetchWeatherForMatchDate, type WeatherSnapshot } from "@/src/lib/weather";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdmin("/admin/matches/new");

  const allSeasons = await db.select().from(seasons);
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const hasError = params.error === "1";

  async function createMatch(formData: FormData) {
    "use server";

    await requireAdminInAction();

    const seasonIdRaw = formData.get("seasonId");
    const matchDateRaw = formData.get("matchDate");
    const team1NameRaw = formData.get("team1Name");
    const team2NameRaw = formData.get("team2Name");

    const seasonId = Number(seasonIdRaw);
    const matchDate = String(matchDateRaw ?? "").trim();
    const team1Name = String(team1NameRaw ?? "").trim();
    const team2Name = String(team2NameRaw ?? "").trim();

    if (!Number.isInteger(seasonId) || !matchDate || !team1Name || !team2Name) {
      redirect("/admin/matches/new?error=1");
    }

    let weatherData: WeatherSnapshot = {
      temperatureC: null,
      feelsLikeC: null,
      conditionLabel: "Wetterdaten nicht verfügbar",
      precipMm: null,
      windKmh: null,
      humidityPct: null,
    };

    try {
      weatherData = await fetchWeatherForMatchDate(matchDate);
    } catch {
      // Falls Open-Meteo fehlschlägt, wird das Match trotzdem angelegt.
    }

    const insertedMatch = await db
      .insert(matches)
      .values({
      seasonId,
      matchDate: new Date(`${matchDate}T00:00:00`),
      team1Name,
      team2Name,
      })
      .returning({ id: matches.id });

    const createdMatchId = insertedMatch[0]?.id;

    if (!createdMatchId) {
      redirect("/admin/matches/new?error=1");
    }

    await db.insert(matchWeather).values({
      matchId: createdMatchId,
      temperatureC: weatherData.temperatureC,
      feelsLikeC: weatherData.feelsLikeC,
      conditionLabel: weatherData.conditionLabel,
      precipMm: weatherData.precipMm,
      windKmh: weatherData.windKmh,
      humidityPct: weatherData.humidityPct !== null ? Math.round(weatherData.humidityPct) : null,
    });

    redirect("/admin/matches/new?success=1");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 p-6 text-zinc-100">
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
        <h1 className="mb-4 text-2xl font-semibold">Neues Spiel anlegen</h1>

        {isSuccess ? (
          <p className="mb-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-emerald-300">
            Spiel wurde erfolgreich angelegt.
          </p>
        ) : null}

        {hasError ? (
          <p className="mb-4 rounded-lg border border-red-700/40 bg-red-950/40 px-3 py-2 text-red-300">
            Bitte alle Pflichtfelder korrekt ausfüllen.
          </p>
        ) : null}

        <form action={createMatch} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Saison</span>
            <select name="seasonId" required className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
            <option value="">Bitte wählen</option>
            {allSeasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Datum des Spiels</span>
            <input
              type="date"
              name="matchDate"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Team 1 Name</span>
            <input
              type="text"
              name="team1Name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">Team 2 Name</span>
            <input
              type="text"
              name="team2Name"
              required
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>

          <p className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300">
            Wetterdaten werden beim Speichern automatisch für Holm-Seppensen aus Open-Meteo geladen.
          </p>

          <button
            type="submit"
            className="w-fit rounded-lg border border-zinc-700 bg-zinc-950/70 px-4 py-2 text-sm hover:border-zinc-500"
          >
            Speichern
          </button>
        </form>
      </section>
    </main>
  );
}