import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/src/db";
import { goalEvents, matchParticipants, matches, players } from "@/src/db/schema";

type TeamSide = "team_1" | "team_2";
type MatchResult = "win" | "loss" | "draw";

type StoryType =
  | "streak"
  | "streak_break"
  | "goals_chase"
  | "assist_chase"
  | "early_goals"
  | "late_goals"
  | "time_window_goals";

export type StoryItem = {
  type: StoryType;
  text: string;
  priority: number;
};

type PlayerStreak = {
  playerId: number;
  playerName: string;
  currentWinStreak: number;
};

type PlayerTotals = {
  playerId: number;
  playerName: string;
  totalGoals: number;
  totalAssists: number;
};

type TimeWindow = {
  key: "early" | "w16_30" | "w31_45" | "w46_60" | "w61_75" | "late";
  label: string;
  min: number;
  max: number;
};

const TIME_WINDOWS: TimeWindow[] = [
  { key: "early", label: "den ersten 15 Minuten", min: 1, max: 15 },
  { key: "w16_30", label: "Minute 16 und 30", min: 16, max: 30 },
  { key: "w31_45", label: "Minute 31 und 45", min: 31, max: 45 },
  { key: "w46_60", label: "Minute 46 und 60", min: 46, max: 60 },
  { key: "w61_75", label: "Minute 61 und 75", min: 61, max: 75 },
  { key: "late", label: "den letzten 15 Minuten", min: 76, max: 999 },
];

function getResultForTeam(teamSide: TeamSide, team1Score: number, team2Score: number): MatchResult {
  if (team1Score === team2Score) return "draw";
  if (teamSide === "team_1") return team1Score > team2Score ? "win" : "loss";
  return team2Score > team1Score ? "win" : "loss";
}

function computeCurrentWinStreak(results: MatchResult[]): number {
  let streak = 0;
  for (const result of results) {
    if (result !== "win") break;
    streak += 1;
  }
  return streak;
}

function buildStreakItems(streaks: PlayerStreak[]): StoryItem[] {
  const items: StoryItem[] = [];

  for (const streak of streaks) {
    if (streak.currentWinStreak < 2) continue;

    items.push({
      type: "streak",
      priority: streak.currentWinStreak >= 3 ? 100 : 90,
      text: `${streak.playerName} ist seit ${streak.currentWinStreak} Spielen ungeschlagen auf Siegkurs – heute winkt Nummer ${streak.currentWinStreak + 1}.`,
    });

    items.push({
      type: "streak_break",
      priority: streak.currentWinStreak >= 3 ? 95 : 85,
      text: `${streak.playerName} jagt den nächsten Sieg in Serie – heute wird die Nervenprobe.`,
    });
  }

  return items;
}

function buildChaseItems(totals: PlayerTotals[], topN: number): StoryItem[] {
  const limited = totals.slice(0, topN);
  const items: StoryItem[] = [];

  for (let i = 1; i < limited.length; i += 1) {
    const chaser = limited[i]!;
    const target = limited[i - 1]!;

    const diffGoals = target.totalGoals - chaser.totalGoals;
    if (diffGoals === 1) {
      items.push({
        type: "goals_chase",
        priority: 80,
        text: `${chaser.playerName} sitzt ${target.playerName} im Nacken – ein Treffer, und beide sind gleichauf.`,
      });
    } else if (diffGoals === 2) {
      items.push({
        type: "goals_chase",
        priority: 70,
        text: `${chaser.playerName} kann ${target.playerName} mit einem Doppelpack überholen.`,
      });
    }

    const diffAssists = target.totalAssists - chaser.totalAssists;
    if (diffAssists === 1) {
      items.push({
        type: "assist_chase",
        priority: 60,
        text: `${chaser.playerName} braucht nur eine Vorlage, um mit ${target.playerName} gleichzuziehen.`,
      });
    } else if (diffAssists === 2) {
      items.push({
        type: "assist_chase",
        priority: 50,
        text: `${chaser.playerName} kann ${target.playerName} mit zwei Vorlagen überholen.`,
      });
    }
  }

  return items;
}

function prioritizeStoryItems(storyItems: StoryItem[], maxItems: number): StoryItem[] {
  const sorted = storyItems.sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text, "de"));
  const result: StoryItem[] = [];
  let timeWindowItemsUsed = 0;

  for (const item of sorted) {
    const isTimeWindowItem =
      item.type === "late_goals" || item.type === "early_goals" || item.type === "time_window_goals";

    if (isTimeWindowItem && timeWindowItemsUsed >= 1) {
      continue;
    }

    result.push(item);
    if (isTimeWindowItem) {
      timeWindowItemsUsed += 1;
    }

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function getTimeWindowByMinute(minute: number): TimeWindow | null {
  for (const window of TIME_WINDOWS) {
    if (minute >= window.min && minute <= window.max) return window;
  }
  return null;
}

function buildTimeWindowItems(params: {
  allPlayers: Array<{ id: number; name: string }>;
  goalsWithMinute: Array<{ scorerPlayerId: number; minute: number }>;
  consideredPlayerIds?: Set<number>;
}): StoryItem[] {
  const { allPlayers, goalsWithMinute, consideredPlayerIds } = params;
  const playerNameById = new Map(allPlayers.map((player) => [player.id, player.name]));

  const countsByWindow = new Map<TimeWindow["key"], Map<number, number>>();
  for (const window of TIME_WINDOWS) {
    countsByWindow.set(window.key, new Map<number, number>());
  }

  for (const goal of goalsWithMinute) {
    if (consideredPlayerIds && !consideredPlayerIds.has(goal.scorerPlayerId)) {
      continue;
    }

    const window = getTimeWindowByMinute(goal.minute);
    if (!window) continue;

    const windowMap = countsByWindow.get(window.key)!;
    windowMap.set(goal.scorerPlayerId, (windowMap.get(goal.scorerPlayerId) ?? 0) + 1);
  }

  const items: StoryItem[] = [];

  for (const window of TIME_WINDOWS) {
    const windowMap = countsByWindow.get(window.key)!;
    if (windowMap.size === 0) continue;

    const maxGoals = Math.max(...Array.from(windowMap.values()));
    if (maxGoals < 3) continue;

    const leaders = Array.from(windowMap.entries()).filter(([, value]) => value === maxGoals);

    for (const [playerId, value] of leaders) {
      const playerName = playerNameById.get(playerId) ?? `Spieler #${playerId}`;

      if (window.key === "late") {
        items.push({
          type: "late_goals",
          priority: 88,
          text: `${playerName} ist der Mann für die Schlussphase: ${value} Tore in ${window.label}.`,
        });
        continue;
      }

      if (window.key === "early") {
        items.push({
          type: "early_goals",
          priority: 78,
          text: `${playerName} startet früh: ${value} Treffer in ${window.label}.`,
        });
        continue;
      }

      items.push({
        type: "time_window_goals",
        priority: 68,
        text: `${playerName} ist in ${window.label} brandgefährlich: ${value} Tore.`,
      });
    }
  }

  return items;
}

export function generateMatchdayStory(storyItems: StoryItem[]): string {
  const streaks = storyItems.filter((item) => item.type === "streak" || item.type === "streak_break");
  const goals = storyItems.filter(
    (item) => item.type === "goals_chase" || item.type === "early_goals" || item.type === "late_goals" || item.type === "time_window_goals"
  );
  const assists = storyItems.filter((item) => item.type === "assist_chase");

  const section = (title: string, lines: string[]) => {
    if (lines.length === 0) return "";
    return `${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;
  };

  return [
    section("**🔥 Serien im Fokus:**", streaks.map((item) => item.text)),
    section("**⚽ Torjäger-Rennen:**", goals.map((item) => item.text)),
    section("**🎯 Assist-Jagd:**", assists.map((item) => item.text)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function buildUpcomingMatchdayStory(options?: {
  matchDateBefore?: Date;
  topN?: number;
  maxItems?: number;
  participantPlayerIds?: number[];
}) {
  const topN = options?.topN ?? 5;
  const maxItems = options?.maxItems ?? 3;
  const matchDateBefore = options?.matchDateBefore ?? new Date();
  const consideredPlayerIds =
    options?.participantPlayerIds && options.participantPlayerIds.length > 0
      ? new Set(options.participantPlayerIds)
      : undefined;

  const allPlayers = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.isActive, true));

  const allPlayersFiltered =
    consideredPlayerIds !== undefined
      ? allPlayers.filter((player) => consideredPlayerIds.has(player.id))
      : allPlayers;

  const historicalMatches = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      team1Score: matches.team1Score,
      team2Score: matches.team2Score,
    })
    .from(matches)
    .where(lt(matches.matchDate, matchDateBefore))
    .orderBy(desc(matches.matchDate), desc(matches.id));

  const matchIds = historicalMatches.map((match) => match.id);

  const participants =
    matchIds.length === 0
      ? []
      : await db
          .select({
            matchId: matchParticipants.matchId,
            playerId: matchParticipants.playerId,
            teamSide: matchParticipants.teamSide,
          })
          .from(matchParticipants)
          .where(inArray(matchParticipants.matchId, matchIds));

  const goals =
    matchIds.length === 0
      ? []
      : await db
          .select({
            scorerPlayerId: goalEvents.scorerPlayerId,
            assistPlayerId: goalEvents.assistPlayerId,
            isOwnGoal: goalEvents.isOwnGoal,
          })
          .from(goalEvents)
          .where(and(inArray(goalEvents.matchId, matchIds), eq(goalEvents.isOwnGoal, false)));

  const goalsWithMinute =
    matchIds.length === 0
      ? []
      : await db
          .select({
            scorerPlayerId: goalEvents.scorerPlayerId,
            minute: goalEvents.minute,
            isOwnGoal: goalEvents.isOwnGoal,
          })
          .from(goalEvents)
          .where(and(inArray(goalEvents.matchId, matchIds), eq(goalEvents.isOwnGoal, false)));

  const matchById = new Map(historicalMatches.map((match) => [match.id, match]));
  const participantRowsByPlayer = new Map<number, Array<{ matchId: number; teamSide: TeamSide }>>();

  for (const row of participants) {
    const list = participantRowsByPlayer.get(row.playerId) ?? [];
    list.push({ matchId: row.matchId, teamSide: row.teamSide as TeamSide });
    participantRowsByPlayer.set(row.playerId, list);
  }

  const streaks: PlayerStreak[] = allPlayersFiltered.map((player) => {
    const rows = participantRowsByPlayer.get(player.id) ?? [];
    const orderedResults = rows
      .map((row) => {
        const match = matchById.get(row.matchId);
        if (!match) return null;
        return {
          matchDate: match.matchDate,
          matchId: match.id,
          result: getResultForTeam(row.teamSide, match.team1Score, match.team2Score),
        };
      })
      .filter((entry): entry is { matchDate: Date; matchId: number; result: MatchResult } => entry !== null)
      .sort((a, b) => {
        const dateDiff = b.matchDate.getTime() - a.matchDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.matchId - a.matchId;
      })
      .map((entry) => entry.result);

    return {
      playerId: player.id,
      playerName: player.name,
      currentWinStreak: computeCurrentWinStreak(orderedResults),
    };
  });

  const goalsByPlayer = new Map<number, number>();
  const assistsByPlayer = new Map<number, number>();
  for (const goal of goals) {
    goalsByPlayer.set(goal.scorerPlayerId, (goalsByPlayer.get(goal.scorerPlayerId) ?? 0) + 1);
    if (goal.assistPlayerId !== null) {
      assistsByPlayer.set(goal.assistPlayerId, (assistsByPlayer.get(goal.assistPlayerId) ?? 0) + 1);
    }
  }

  const totals: PlayerTotals[] = allPlayersFiltered
    .map((player) => ({
      playerId: player.id,
      playerName: player.name,
      totalGoals: goalsByPlayer.get(player.id) ?? 0,
      totalAssists: assistsByPlayer.get(player.id) ?? 0,
    }))
    .filter((player) => player.totalGoals > 0 || player.totalAssists > 0)
    .sort((a, b) => {
      if (b.totalGoals !== a.totalGoals) return b.totalGoals - a.totalGoals;
      if (b.totalAssists !== a.totalAssists) return b.totalAssists - a.totalAssists;
      return a.playerName.localeCompare(b.playerName, "de");
    });

  const streakItems = buildStreakItems(streaks);
  const chaseItems = buildChaseItems(totals, topN);
  const timeWindowItems = buildTimeWindowItems({
    allPlayers: allPlayersFiltered,
    goalsWithMinute: goalsWithMinute
      .filter((goal) => goal.minute !== null)
      .map((goal) => ({ scorerPlayerId: goal.scorerPlayerId, minute: goal.minute as number })),
    consideredPlayerIds,
  });
  const storyItems = prioritizeStoryItems([...streakItems, ...chaseItems, ...timeWindowItems], maxItems);

  return {
    storyItems,
    storyText: generateMatchdayStory(storyItems),
  };
}