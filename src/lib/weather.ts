import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { matchWeather } from "@/src/db/schema";

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

export type WeatherSnapshot = {
  temperatureC: number | null;
  feelsLikeC: number | null;
  conditionLabel: string | null;
  precipMm: number | null;
  windKmh: number | null;
  humidityPct: number | null;
};

const FETCH_TIMEOUT_MS = 15000;
const FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 750;

export const EMPTY_WEATHER: WeatherSnapshot = {
  temperatureC: null,
  feelsLikeC: null,
  conditionLabel: null,
  precipMm: null,
  windKmh: null,
  humidityPct: null,
};

// Eine Zeile gilt nur mit Temperatur als echter Datensatz. Platzhalter-Zeilen
// (Abruf fehlgeschlagen) sollen bei jedem weiteren Aufruf neu geholt werden.
export function hasUsableWeather(snapshot: {
  temperatureC: number | null;
}) {
  return snapshot.temperatureC !== null;
}

function toWeatherColumns(snapshot: WeatherSnapshot) {
  return {
    temperatureC: snapshot.temperatureC,
    feelsLikeC: snapshot.feelsLikeC,
    conditionLabel: snapshot.conditionLabel,
    precipMm: snapshot.precipMm,
    windKmh: snapshot.windKmh,
    humidityPct: snapshot.humidityPct !== null ? Math.round(snapshot.humidityPct) : null,
  };
}

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
  const preferredHour = 19;
  const exactIndex = times.findIndex((time) => {
    const hour = Number(time.split("T")[1]?.slice(0, 2));
    return Number.isInteger(hour) && hour === preferredHour;
  });

  if (exactIndex !== -1) {
    return exactIndex;
  }

  return Math.floor(times.length / 2);
}

function toIsoDateInBerlin(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: HOLM_SEPPENSEN.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getBerlinWeekdayIndex(date: Date) {
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: HOLM_SEPPENSEN.timezone,
    weekday: "short",
  }).format(date);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return weekdayMap[weekdayShort] ?? 0;
}

function getBerlinHour(date: Date) {
  const hourRaw = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOLM_SEPPENSEN.timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);

  const hour = Number(hourRaw);
  return Number.isFinite(hour) ? hour : 0;
}

export function getUpcomingMondayIsoInBerlin() {
  const today = new Date();
  const weekdayIndex = getBerlinWeekdayIndex(today);
  const berlinHour = getBerlinHour(today);

  const isMondayAfterKickoff = weekdayIndex === 1 && berlinHour >= 19;
  const daysUntilMonday = isMondayAfterKickoff ? 7 : (1 - weekdayIndex + 7) % 7;

  const upcomingMonday = new Date(today);
  upcomingMonday.setDate(today.getDate() + daysUntilMonday);

  return toIsoDateInBerlin(upcomingMonday);
}

function chooseWeatherEndpoint(matchDateIso: string) {
  const todayIso = toIsoDateInBerlin(new Date());
  const baseUrl =
    matchDateIso < todayIso
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";

  return new URL(baseUrl);
}

async function requestWeather(matchDateIso: string) {
  const weatherUrl = chooseWeatherEndpoint(matchDateIso);
  weatherUrl.searchParams.set("latitude", String(HOLM_SEPPENSEN.latitude));
  weatherUrl.searchParams.set("longitude", String(HOLM_SEPPENSEN.longitude));
  weatherUrl.searchParams.set("timezone", HOLM_SEPPENSEN.timezone);
  weatherUrl.searchParams.set("start_date", matchDateIso);
  weatherUrl.searchParams.set("end_date", matchDateIso);
  weatherUrl.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m,weather_code"
  );

  let lastError: unknown = new Error("Open-Meteo: kein Abrufversuch ausgeführt.");

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(weatherUrl.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Open-Meteo Fehler: ${response.status}`);
      }

      return (await response.json()) as OpenMeteoHourlyResponse;
    } catch (error) {
      lastError = error;

      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError;
}

export async function fetchWeatherForMatchDate(matchDateIso: string): Promise<WeatherSnapshot> {
  const data = await requestWeather(matchDateIso);
  const times = data.hourly?.time ?? [];

  if (times.length === 0) {
    // Als Fehler behandeln, damit ein leeres Ergebnis nicht als gültiger
    // Datensatz gespeichert wird und der nächste Aufruf es erneut versucht.
    throw new Error(`Open-Meteo lieferte keine Stundenwerte für ${matchDateIso}.`);
  }

  const index = pickHourIndex(times);

  const precipMm = data.hourly?.precipitation?.[index] ?? null;

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

export async function ensureWeatherStoredForMatch(
  matchId: number,
  matchDate: Date | string,
): Promise<WeatherSnapshot> {
  const existingRow = await db
    .select({
      temperatureC: matchWeather.temperatureC,
      feelsLikeC: matchWeather.feelsLikeC,
      conditionLabel: matchWeather.conditionLabel,
      precipMm: matchWeather.precipMm,
      windKmh: matchWeather.windKmh,
      humidityPct: matchWeather.humidityPct,
    })
    .from(matchWeather)
    .where(eq(matchWeather.matchId, matchId))
    .limit(1);

  const existing = existingRow[0] ?? null;

  if (existing && hasUsableWeather(existing)) {
    return existing;
  }

  // Strings kommen bereits als "YYYY-MM-DD" aus dem Formular und werden nicht
  // über Date geführt, damit die Server-Zeitzone das Datum nicht verschiebt.
  const matchDateIso = typeof matchDate === "string" ? matchDate : toIsoDateInBerlin(matchDate);

  let weatherData: WeatherSnapshot | null = null;

  try {
    weatherData = await fetchWeatherForMatchDate(matchDateIso);
  } catch {
    // Abruf fehlgeschlagen – der nächste Aufruf versucht es erneut.
  }

  if (weatherData === null || !hasUsableWeather(weatherData)) {
    if (!existing) {
      // Platzhalter anlegen, damit das Match einen Datensatz hat. Ohne Werte,
      // damit er beim nächsten Aufruf als nachladbar erkannt wird.
      await db
        .insert(matchWeather)
        .values({ matchId, ...toWeatherColumns(EMPTY_WEATHER) })
        .onConflictDoNothing({ target: matchWeather.matchId });
    }

    return existing ?? EMPTY_WEATHER;
  }

  const columns = toWeatherColumns(weatherData);

  await db
    .insert(matchWeather)
    .values({ matchId, ...columns })
    .onConflictDoUpdate({ target: matchWeather.matchId, set: columns });

  return weatherData;
}