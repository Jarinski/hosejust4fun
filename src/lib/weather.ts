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

export function getUpcomingMondayIsoInBerlin() {
  const today = new Date();
  const weekdayIndex = getBerlinWeekdayIndex(today);
  const daysUntilMonday = (1 - weekdayIndex + 7) % 7;

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

export async function fetchWeatherForMatchDate(matchDateIso: string): Promise<WeatherSnapshot> {
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

export async function ensureWeatherStoredForMatch(matchId: number, matchDate: Date): Promise<WeatherSnapshot> {
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

  if (existingRow[0]) {
    return existingRow[0];
  }

  const matchDateIso = toIsoDateInBerlin(matchDate);

  let weatherData: WeatherSnapshot = {
    temperatureC: null,
    feelsLikeC: null,
    conditionLabel: "Wetterdaten nicht verfügbar",
    precipMm: null,
    windKmh: null,
    humidityPct: null,
  };

  try {
    weatherData = await fetchWeatherForMatchDate(matchDateIso);
  } catch {
    // Match soll trotzdem einen fixierten Wetter-Datensatz erhalten.
  }

  await db
    .insert(matchWeather)
    .values({
      matchId,
      temperatureC: weatherData.temperatureC,
      feelsLikeC: weatherData.feelsLikeC,
      conditionLabel: weatherData.conditionLabel,
      precipMm: weatherData.precipMm,
      windKmh: weatherData.windKmh,
      humidityPct: weatherData.humidityPct !== null ? Math.round(weatherData.humidityPct) : null,
    })
    .onConflictDoNothing({ target: matchWeather.matchId });

  return weatherData;
}