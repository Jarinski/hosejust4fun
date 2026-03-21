type TeamSide = "team_1" | "team_2";

type MatchStoryInput = {
  match: {
    team1Name: string;
    team2Name: string;
    team1Goals: number;
    team2Goals: number;
    mvpPlayerId?: number | null;
    mvpName?: string | null;
  };
  goals: Array<{
    teamSide: TeamSide;
    isOwnGoal: boolean;
    scorerPlayerId: number;
    scorerName?: string | null;
    assistPlayerId?: number | null;
  }>;
  weather: {
    conditionLabel: string | null;
    temperatureC: number | null;
    precipMm: number | null;
  } | null;
  previousMatches?: Array<{
    team1Name: string;
    team2Name: string;
    team1Goals: number;
    team2Goals: number;
  }>;
};

type TeamResult = "win" | "loss" | "draw";

function resultForTeam(
  match: { team1Name: string; team2Name: string; team1Goals: number; team2Goals: number },
  teamName: string
): TeamResult | null {
  const isTeam1 = match.team1Name === teamName;
  const isTeam2 = match.team2Name === teamName;

  if (!isTeam1 && !isTeam2) return null;
  if (match.team1Goals === match.team2Goals) return "draw";

  if (isTeam1) {
    return match.team1Goals > match.team2Goals ? "win" : "loss";
  }

  return match.team2Goals > match.team1Goals ? "win" : "loss";
}

function getPreviousConsecutiveCount(teamName: string, target: TeamResult, previousMatches: MatchStoryInput["previousMatches"]) {
  if (!previousMatches || previousMatches.length === 0) return 0;

  let count = 0;
  for (const previousMatch of previousMatches) {
    const result = resultForTeam(previousMatch, teamName);
    if (result === null) continue;
    if (result !== target) break;
    count += 1;
  }
  return count;
}

function conditionLooksRainy(conditionLabel: string | null) {
  if (!conditionLabel) return false;
  const value = conditionLabel.toLowerCase();
  return ["regen", "niesel", "schauer", "drizzle", "rain", "shower"].some((term) => value.includes(term));
}

export function buildMatchStory(input: MatchStoryInput): string[] {
  const { match, goals, weather, previousMatches } = input;
  const story: string[] = [];

  const goalsByScorer = new Map<number, { goals: number; name: string }>();
  for (const goal of goals) {
    // Eigentore zählen nicht als normale Tore.
    if (goal.isOwnGoal) continue;

    const existing = goalsByScorer.get(goal.scorerPlayerId);
    goalsByScorer.set(goal.scorerPlayerId, {
      goals: (existing?.goals ?? 0) + 1,
      name: goal.scorerName ?? existing?.name ?? `Spieler #${goal.scorerPlayerId}`,
    });
  }

  const scorers = [...goalsByScorer.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  for (const scorer of scorers) {
    if (scorer.goals >= 3) {
      story.push(`🎩 Hattrick: ${scorer.name} traf ${scorer.goals}-mal.`);
    } else if (scorer.goals >= 2) {
      story.push(`⚽ Doppelpack: ${scorer.name} traf ${scorer.goals}-mal.`);
    }
  }

  if (weather) {
    const isRain = (weather.precipMm ?? 0) > 0 || conditionLooksRainy(weather.conditionLabel);
    if (isRain) {
      story.push("🌧️ Regen prägte die Bedingungen auf dem Platz.");
    }

    if (weather.temperatureC !== null && weather.temperatureC < 10) {
      story.push(`🥶 Kühle Partie bei nur ${weather.temperatureC.toFixed(1)}°C.`);
    }
  }

  const totalGoals = match.team1Goals + match.team2Goals;
  const margin = Math.abs(match.team1Goals - match.team2Goals);

  if (totalGoals >= 8) {
    story.push(`🔥 Torfestival mit ${totalGoals} Treffern.`);
  }

  if (margin <= 1) {
    story.push(
      margin === 0
        ? "🤝 Knappe Partie: Remis ohne Sieger."
        : "🧨 Knappe Partie mit nur einem Tor Unterschied."
    );
  } else if (margin >= 3) {
    story.push(`📈 Deutlicher Sieg mit ${margin} Toren Vorsprung.`);
  }

  // MVP immer anzeigen.
  if (match.mvpPlayerId !== null && match.mvpPlayerId !== undefined) {
    story.push(`🏆 MVP des Spiels: ${match.mvpName ?? `Spieler #${match.mvpPlayerId}`}.`);
  } else {
    story.push("🏆 MVP des Spiels: Noch nicht gewählt.");
  }

  if (previousMatches && previousMatches.length > 0) {
    const currentTeam1Result = resultForTeam(
      {
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        team1Goals: match.team1Goals,
        team2Goals: match.team2Goals,
      },
      match.team1Name
    );

    const currentTeam2Result = resultForTeam(
      {
        team1Name: match.team1Name,
        team2Name: match.team2Name,
        team1Goals: match.team1Goals,
        team2Goals: match.team2Goals,
      },
      match.team2Name
    );

    const team1PrevWins = getPreviousConsecutiveCount(match.team1Name, "win", previousMatches);
    const team1PrevLosses = getPreviousConsecutiveCount(match.team1Name, "loss", previousMatches);
    const team2PrevWins = getPreviousConsecutiveCount(match.team2Name, "win", previousMatches);
    const team2PrevLosses = getPreviousConsecutiveCount(match.team2Name, "loss", previousMatches);

    if (currentTeam1Result === "win" && team1PrevWins + 1 >= 3) {
      story.push(`📊 Winning Streak: ${match.team1Name} mit ${team1PrevWins + 1} Siegen in Serie.`);
    }
    if (currentTeam2Result === "win" && team2PrevWins + 1 >= 3) {
      story.push(`📊 Winning Streak: ${match.team2Name} mit ${team2PrevWins + 1} Siegen in Serie.`);
    }

    if (currentTeam1Result === "loss" && team1PrevLosses + 1 >= 3) {
      story.push(`📉 Losing Streak: ${match.team1Name} mit ${team1PrevLosses + 1} Niederlagen in Serie.`);
    }
    if (currentTeam2Result === "loss" && team2PrevLosses + 1 >= 3) {
      story.push(`📉 Losing Streak: ${match.team2Name} mit ${team2PrevLosses + 1} Niederlagen in Serie.`);
    }

    if (team1PrevWins >= 3 && currentTeam1Result !== "win") {
      story.push(`🔚 Serie beendet: Die Siegesserie von ${match.team1Name} riss.`);
    }
    if (team2PrevWins >= 3 && currentTeam2Result !== "win") {
      story.push(`🔚 Serie beendet: Die Siegesserie von ${match.team2Name} riss.`);
    }
    if (team1PrevLosses >= 3 && currentTeam1Result !== "loss") {
      story.push(`🛑 Serie beendet: ${match.team1Name} stoppte die Niederlagenserie.`);
    }
    if (team2PrevLosses >= 3 && currentTeam2Result !== "loss") {
      story.push(`🛑 Serie beendet: ${match.team2Name} stoppte die Niederlagenserie.`);
    }
  }

  return story;
}
