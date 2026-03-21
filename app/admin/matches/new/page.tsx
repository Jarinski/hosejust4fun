import { redirect } from "next/navigation";
import { db } from "@/src/db";
import { matches, matchWeather, seasons } from "@/src/db/schema";

const HOLM_SEPPENSEN = {
  latitude: 53.284654,
  longitude: 9.869992,
  timezone: "Europe/Berlin",
};

type OpenMeteoHourlyResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
    relative_humidity_2m?: number[];
    weather_code?: number[];
  };
};

function weatherCodeToLabel(code: number | null) {
  if (code === null) return null;
  if (code === 0) return "Klar";
  if (code >= 1 && code <= 3) return "Bewölkt";
  if (code === 45 || code === 48) return "Nebel";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "Regen";
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "Schnee";
  if (code >= 95) return "Gewitter";
  return "Unbekannt";
}

function pickHourIndex(times: string[]) {
  const preferredHour = 18;
  const exactIndex = times.findIndex((time) => {
    const hour = Number(time.split("T")[1]?.slice(0, 2));
    return Number.isInteger(hour) && hour === preferredHour;
  });

  if (exactIndex !== -1) {
    return exactIndex;
  }

  return Math.floor(times.length / 2);
}

async function fetchWeatherForMatchDate(matchDateIso: string) {
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(HOLM_SEPPENSEN.latitude));
  weatherUrl.searchParams.set("longitude", String(HOLM_SEPPENSEN.longitude));
  weatherUrl.searchParams.set("timezone", HOLM_SEPPENSEN.timezone);
  weatherUrl.searchParams.set("start_date", matchDateIso);
  weatherUrl.searchParams.set("end_date", matchDateIso);
  weatherUrl.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code"
  );

  const response = await fetch(weatherUrl.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo Fehler: ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoHourlyResponse;
  const times = data.hourly?.time ?? [];

  if (times.length === 0) {
    return {
      temperatureC: null,
      feelsLikeC: null,
      conditionLabel: "Wetterdaten nicht verfügbar",
      precipMm: null,
      windKmh: null,
      humidityPct: null,
    };
  }

  const index = pickHourIndex(times);

  const hourlyPrecip = data.hourly?.precipitation ?? [];
  const precipMm =
    hourlyPrecip.length > 0
      ? hourlyPrecip.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
      : null;

  const weatherCodeAtHour = data.hourly?.weather_code?.[index] ?? null;

  return {
    temperatureC: data.hourly?.temperature_2m?.[index] ?? null,
    feelsLikeC: data.hourly?.apparent_temperature?.[index] ?? null,
    conditionLabel: weatherCodeToLabel(weatherCodeAtHour),
    precipMm,
    windKmh: data.hourly?.wind_speed_10m?.[index] ?? null,
    humidityPct: data.hourly?.relative_humidity_2m?.[index] ?? null,
  };
}

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const allSeasons = await db.select().from(seasons);
  const params = await searchParams;
  const isSuccess = params.success === "1";
  const hasError = params.error === "1";

  async function createMatch(formData: FormData) {
    "use server";

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

    let weatherData: {
      temperatureC: number | null;
      feelsLikeC: number | null;
      conditionLabel: string | null;
      precipMm: number | null;
      windKmh: number | null;
      humidityPct: number | null;
    } = {
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