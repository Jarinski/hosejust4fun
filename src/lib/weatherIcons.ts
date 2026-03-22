export type WeatherIconInput = {
  conditionLabel?: string | null;
  precipMm?: number | null;
  temperatureC?: number | null;
  windKph?: number | null;
  windKmh?: number | null;
};

export type WeatherBadge = {
  icon: string;
  label: string;
};

export type WeatherIconResult = {
  icon: string;
  label: string;
  tone: "storm" | "rain" | "cloud" | "sun" | "neutral";
  className: string;
  badges: WeatherBadge[];
};

const THUNDER_REGEX = /(gewitter|thunder|storm)/i;
const RAIN_REGEX = /(regen|rain)/i;
const DRIZZLE_REGEX = /(drizzle|niesel|schauer)/i;
const CLOUD_REGEX = /(bew[öo]lkt|wolkig|cloud|overcast|nebel|fog|mist)/i;
const PARTLY_SUNNY_REGEX = /(heiter|teilweise sonnig|partly|sunny intervals)/i;
const SUNNY_REGEX = /(sonnig|klar|clear|sunny)/i;
const RAIN_MIN_MM = 1;
const MODERATE_RAIN_MIN_MM = 2.5;
const HEAVY_RAIN_MIN_MM = 10;
const STORM_RAIN_MIN_MM = 25;

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function isRainLikeWeather(input: WeatherIconInput) {
  const label = normalizeLabel(input.conditionLabel).toLowerCase();
  const precip = input.precipMm ?? null;
  return THUNDER_REGEX.test(label) || RAIN_REGEX.test(label) || (precip !== null && precip >= RAIN_MIN_MM);
}

export function isSunnyLikeWeather(input: WeatherIconInput) {
  const label = normalizeLabel(input.conditionLabel).toLowerCase();
  const precip = input.precipMm ?? null;
  const temperature = input.temperatureC ?? null;
  const hasSunshineSignal = SUNNY_REGEX.test(label) || PARTLY_SUNNY_REGEX.test(label);

  // Wichtig: "Schönwetter" soll exakt zur UI-Definition passen,
  // damit Spiele nicht gleichzeitig in Schönwetter und Schlechtwetter landen.
  // Definition: 0 mm Niederschlag UND mindestens 15 °C UND Sonnenschein/Heiterkeit.
  return precip !== null && precip === 0 && temperature !== null && temperature >= 15 && hasSunshineSignal;
}

export function isMildDryWeather(input: WeatherIconInput) {
  const precip = input.precipMm ?? null;
  const temperature = input.temperatureC ?? null;

  // Warm und trocken, aber nicht zwingend sonnig (z. B. 20°C + bewölkt).
  return precip !== null && precip === 0 && temperature !== null && temperature >= 15;
}

export function getWeatherPresentation(input: WeatherIconInput): WeatherIconResult {
  const label = normalizeLabel(input.conditionLabel);
  const normalizedLabel = label.toLowerCase();
  const precip = input.precipMm ?? null;
  const temperature = input.temperatureC ?? null;
  const wind = input.windKph ?? input.windKmh ?? null;

  const hasThunder = THUNDER_REGEX.test(normalizedLabel);
  const hasRain = RAIN_REGEX.test(normalizedLabel) || (precip !== null && precip >= RAIN_MIN_MM);
  const hasDrizzle =
    DRIZZLE_REGEX.test(normalizedLabel) || (precip !== null && precip > 0 && precip < RAIN_MIN_MM);
  const hasClouds = CLOUD_REGEX.test(normalizedLabel);
  const isPartlySunny = PARTLY_SUNNY_REGEX.test(normalizedLabel);
  const isSunny = SUNNY_REGEX.test(normalizedLabel);

  let icon = "🌥️";
  let displayLabel = label || "Wetter";
  let tone: WeatherIconResult["tone"] = "neutral";
  let className = "text-zinc-200";

  if (hasThunder) {
    icon = "⛈️";
    displayLabel = "Gewitter";
    tone = "storm";
    className = "text-violet-300";
  } else if (hasRain) {
    icon = "🌧️";
    if (precip !== null && precip >= STORM_RAIN_MIN_MM) {
      displayLabel = "Unwetterregen";
    } else if (precip !== null && precip >= HEAVY_RAIN_MIN_MM) {
      displayLabel = "Starkregen";
    } else if (precip !== null && precip >= MODERATE_RAIN_MIN_MM) {
      displayLabel = "Mäßiger Regen";
    } else {
      displayLabel = "Leichter Regen";
    }
    tone = "rain";
    className = "text-sky-300";
  } else if (hasDrizzle) {
    icon = "🌦️";
    displayLabel = "Schauer";
    tone = "rain";
    className = "text-sky-200";
  } else if (hasClouds) {
    icon = "☁️";
    displayLabel = "Bewölkt";
    tone = "cloud";
    className = "text-zinc-300";
  } else if (isPartlySunny) {
    icon = "🌤️";
    displayLabel = "Heiter";
    tone = "sun";
    className = "text-amber-300";
  } else if (isSunny || (precip !== null && precip === 0 && temperature !== null && temperature >= 15)) {
    icon = "☀️";
    displayLabel = "Sonnig";
    tone = "sun";
    className = "text-amber-300";
  }

  const badges: WeatherBadge[] = [];
  if (temperature !== null && temperature < 5) {
    badges.push({ icon: "🥶", label: "Sehr kalt" });
  }
  if (wind !== null && wind >= 22) {
    badges.push({ icon: "💨", label: "Windig" });
  }

  return {
    icon,
    label: displayLabel,
    tone,
    className,
    badges,
  };
}
