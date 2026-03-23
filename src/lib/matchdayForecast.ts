import { isRainLikeWeather } from "@/src/lib/weatherIcons";
import type { WeatherSnapshot } from "@/src/lib/weather";

type SelectedPlayer = {
  id: number;
  name: string;
};

type DuoForecast = {
  playerAName: string;
  playerBName: string;
  gamesTogether: number;
  winsTogether: number;
  winRatePct: number;
};

type ReturningPlayer = {
  name: string;
  missedMatches: number;
};

type WeatherPerformanceLeader = {
  name: string;
  value: number;
  games: number;
  perGame: number;
};

type WeatherPerformanceInsight = {
  condition: "cold" | "sunny" | "rain" | "mild_dry";
  sampleMatches: number;
  topScorer: WeatherPerformanceLeader | null;
  topAssist: WeatherPerformanceLeader | null;
};

type MatchdayForecastInput = {
  selectedPlayers: SelectedPlayer[];
  canceledPlayers: SelectedPlayer[];
  weather: WeatherSnapshot;
  strongestDuo: DuoForecast | null;
  bestOverallDuo: DuoForecast | null;
  bestAvailableDuo: DuoForecast | null;
  returningPlayers: ReturningPlayer[];
  weatherPerformance: WeatherPerformanceInsight | null;
  canceledStreakPlayer: {
    name: string;
    streak: number;
  } | null;
};

export function buildMatchdayForecast(input: MatchdayForecastInput) {
  const {
    selectedPlayers,
    canceledPlayers,
    weather,
    strongestDuo,
    bestOverallDuo,
    bestAvailableDuo,
    returningPlayers,
    weatherPerformance,
    canceledStreakPlayer,
  } = input;
  const lines: string[] = [];

  if (selectedPlayers.length === 0) {
    if (canceledPlayers.length > 0) {
      const canceledNames = canceledPlayers.map((player) => player.name);
      const canceledLabel =
        canceledNames.length === 1
          ? canceledNames[0]
          : `${canceledNames.slice(0, -1).join(", ")} und ${canceledNames[canceledNames.length - 1]}`;

      return [
        "📭 Noch keine Zusagen – aktuell gewinnt nur der innere Schweinehund.",
        `🚫 Absage${canceledPlayers.length > 1 ? "n" : ""}: ${canceledLabel} ${
          canceledPlayers.length > 1 ? "sind" : "ist"
        } diesmal raus.`,
      ];
    }

    return [
      "📭 Noch keine Zusagen – aktuell gewinnt nur der innere Schweinehund.",
      "🗓️ Trag erst ein paar Teilnehmer ein, dann gibt’s den großen HoSe-Forecast.",
    ];
  }

  lines.push(
    selectedPlayers.length >= 18
      ? `🔥 ${selectedPlayers.length} Zusagen! Das riecht nach Champions-League-Niveau auf Kunstrasen.`
      : `📋 Bisher ${selectedPlayers.length} Zusagen – Kader steht, Ausreden zählen nicht mehr.`
  );

  if (strongestDuo && strongestDuo.gamesTogether >= 2) {
    lines.push(
      `🤝 ${strongestDuo.playerAName} + ${strongestDuo.playerBName}: ${strongestDuo.winsTogether}/${strongestDuo.gamesTogether} Siege gemeinsam (${strongestDuo.winRatePct}%). Wenn die zusammen in ein Team rutschen, wird’s für die anderen ungemütlich.`
    );
  }

  if (canceledPlayers.length > 0) {
    const canceledNames = canceledPlayers.map((player) => player.name);
    const canceledLabel =
      canceledNames.length === 1
        ? canceledNames[0]
        : `${canceledNames.slice(0, -1).join(", ")} und ${canceledNames[canceledNames.length - 1]}`;

    lines.push(
      `🚫 Absage${canceledPlayers.length > 1 ? "n" : ""}: ${canceledLabel} ${
        canceledPlayers.length > 1 ? "sind" : "ist"
      } diesmal raus.`
    );
  }

  if (canceledStreakPlayer && canceledStreakPlayer.streak >= 3) {
    lines.push(
      `🤔 ${canceledStreakPlayer.name} hat eine Winning Streak von ${canceledStreakPlayer.streak} Spielen und hat diesmal abgesagt – was ist da los?`
    );
  }

  if (
    bestOverallDuo &&
    bestOverallDuo.gamesTogether >= 3 &&
    canceledPlayers.some((player) => player.name === bestOverallDuo.playerAName) &&
    canceledPlayers.some((player) => player.name === bestOverallDuo.playerBName)
  ) {
    if (bestAvailableDuo && bestAvailableDuo.gamesTogether >= 2) {
      lines.push(
        `📉 ${bestOverallDuo.playerAName} und ${bestOverallDuo.playerBName} haben abgesagt – dabei sind sie das aktuell beste Duo. Chance für ${bestAvailableDuo.playerAName} + ${bestAvailableDuo.playerBName}, Boden gutzumachen.`
      );
    } else {
      lines.push(
        `📉 ${bestOverallDuo.playerAName} und ${bestOverallDuo.playerBName} haben abgesagt – damit fehlt das derzeit stärkste Duo komplett.`
      );
    }
  }

  for (const returning of returningPlayers.slice(0, 2)) {
    lines.push(
      `🙌 ${returning.name} war ${returning.missedMatches} Spieltage nicht dabei. Schön, dass er wieder am Start ist!`
    );
  }

  const isCold = weather.temperatureC !== null && weather.temperatureC < 8;
  const isRain = isRainLikeWeather({
    conditionLabel: weather.conditionLabel,
    precipMm: weather.precipMm,
  });
  const isWindy = weather.windKmh !== null && weather.windKmh >= 20;

  if (weatherPerformance && weatherPerformance.sampleMatches >= 2) {
    const weatherLabel =
      weatherPerformance.condition === "cold"
        ? "Kälte"
        : weatherPerformance.condition === "rain"
          ? "Regen"
          : weatherPerformance.condition === "mild_dry"
            ? "Mild-&-trocken"
          : "Schönwetter";

    if (weatherPerformance.topScorer) {
      lines.push(
        `📈 ${weatherLabel}-Trend (Tore): ${weatherPerformance.topScorer.name} liefert ${weatherPerformance.topScorer.value} Tore in ${weatherPerformance.topScorer.games} Spielen (${weatherPerformance.topScorer.perGame.toFixed(2)} pro Spiel).`
      );
    }

    if (weatherPerformance.topAssist) {
      lines.push(
        `🅰️ ${weatherLabel}-Trend (Assists): ${weatherPerformance.topAssist.name} kommt auf ${weatherPerformance.topAssist.value} Vorlagen in ${weatherPerformance.topAssist.games} Spielen (${weatherPerformance.topAssist.perGame.toFixed(2)} pro Spiel).`
      );
    }
  }

  if (isCold) {
    lines.push("🥶 Es wird kalt – Handschuhe raus, Technik rein.");
  }

  if (isRain) {
    lines.push("🌧️ Regen in Sicht: Heute gewinnt das Team mit den besseren Stollen und schlechteren Frisuren-Sorgen.");
  }

  if (isWindy) {
    lines.push("💨 Windiger Abend: Distanzschüsse werden zur Lotterie mit Unterhaltungswert.");
  }

  if (lines.length < 3) {
    lines.push("Wildes Teilnehmerfeld, keine Prognose möglich, jeder kann zum Helden werden.");
  }

  return lines;
}
