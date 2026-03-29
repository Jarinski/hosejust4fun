export const BADGE_KEYS = {
  // Goal badges
  // Zeit
  WINNING_GOAL: "winning_goal",
  FIRST_15_GOAL: "first_15_goal",
  LAST_15_GOAL: "last_15_goal",
  LAST_MINUTE_GOAL: "last_minute_goal",
  FAST_START_GOAL: "fast_start_goal",

  // Spielstand
  EQUALIZER_GOAL: "equalizer_goal",
  COMEBACK_GOAL: "comeback_goal",
  CONSOLATION_GOAL: "consolation_goal",

  // Spieltyp
  LONGSHOT_GOAL: "longshot_goal",
  CORNER_GOAL: "corner_goal",
  REBOUND_GOAL: "rebound_goal",

  // Wetter
  RAIN_GOAL: "rain_goal",
  SUNSHINE_GOAL: "sunshine_goal",
  CLOUDY_GOAL: "cloudy_goal",
  HEAT_GOAL: "heat_goal",
  COLD_GOAL: "cold_goal",

  // Assist badges
  // Basis
  DOUBLE_ASSIST_MATCH: "double_assist_match",

  // Zeit
  FIRST_15_ASSIST: "first_15_assist",
  LAST_15_ASSIST: "last_15_assist",
  LAST_MINUTE_ASSIST: "last_minute_assist",
  FAST_START_ASSIST: "fast_start_assist",

  // Spielstand
  EQUALIZER_ASSIST: "equalizer_assist",
  COMEBACK_ASSIST: "comeback_assist",
  WINNING_GOAL_ASSIST: "winning_goal_assist",
  CONSOLATION_ASSIST: "consolation_assist",

  // Wetter
  RAIN_ASSIST: "rain_assist",
  SUNSHINE_ASSIST: "sunshine_assist",
  CLOUDY_ASSIST: "cloudy_assist",
  HEAT_ASSIST: "heat_assist",
  COLD_ASSIST: "cold_assist",

  // Spieltyp
  CORNER_ASSIST: "corner_assist",

  // Match / performance badges
  BRACE: "brace",
  HATTRICK: "hattrick",
  MUTUAL_ASSIST_SAME_MATCH: "mutual_assist_same_match",

  // Defense badges
  // Basis
  CLEAN_SHEET: "clean_sheet",
  FIRST_HALF_CLEAN_SHEET: "first_half_clean_sheet",
  SECOND_HALF_CLEAN_SHEET: "second_half_clean_sheet",

  // Erweitert
  CLEAN_SHEET_BIG_WIN: "clean_sheet_big_win",
  CLEAN_SHEET_CLOSE_GAME: "clean_sheet_close_game",

  // Zeit
  EARLY_WALL: "early_wall",
  LATE_WALL: "late_wall",
  LAST_MINUTE_DEFENSE: "last_minute_defense",

  // Serien
  CLEAN_SHEET_STREAK_2: "clean_sheet_streak_2",
  CLEAN_SHEET_STREAK_3: "clean_sheet_streak_3",

  // Wetter
  RAIN_WALL: "rain_wall",
  HEAT_WALL: "heat_wall",
  COLD_WALL: "cold_wall",

  // Team / streak badges
  COMEBACK_WIN: "comeback_win",
  WIN_STREAK_3: "win_streak_3",
  WIN_STREAK_5: "win_streak_5",
  WIN_STREAK_10: "win_streak_10",
  LOSS_STREAK_3: "loss_streak_3",
  LOSS_STREAK_5: "loss_streak_5",
  LOSS_STREAK_10: "loss_streak_10",
  DRAW_MATCH: "draw_match",
  DRAW_STREAK_2: "draw_streak_2",
} as const;

export type BadgeKey = (typeof BADGE_KEYS)[keyof typeof BADGE_KEYS];

export const BADGE_CATEGORY_ORDER = [
  "Tore",
  "Assists",
  "Spielverlauf",
  "Defense",
  "Wetter",
  "Zusammenspiel",
  "Serien",
] as const;

export type BadgeCategory = (typeof BADGE_CATEGORY_ORDER)[number] | "Unbekannt";

export type BadgeMeta = {
  label: string;
  emoji: string;
  category: BadgeCategory;
  description?: string;
};

export type BadgeRarity = "legendär" | "episch" | "selten" | "häufig";

export const BADGE_META_BY_KEY: Record<BadgeKey, BadgeMeta> = {
  winning_goal: { label: "Siegtorschütze", emoji: "🏆", category: "Tore" },
  first_15_goal: { label: "Früher Treffer", emoji: "🌅", category: "Tore" },
  last_15_goal: { label: "Später Treffer", emoji: "🌙", category: "Tore" },
  last_minute_goal: { label: "Last Minute", emoji: "⏱️", category: "Tore" },
  fast_start_goal: { label: "Schnellstarter", emoji: "⚡", category: "Tore" },
  equalizer_goal: { label: "Ausgleichstreffer", emoji: "⚖️", category: "Tore" },
  comeback_goal: { label: "Comeback-Tor", emoji: "🔄", category: "Tore" },
  consolation_goal: { label: "Ehrentreffer", emoji: "🎖️", category: "Tore" },
  longshot_goal: { label: "Fernschütze", emoji: "🚀", category: "Tore" },
  corner_goal: { label: "Eckenverwerter", emoji: "📐", category: "Tore" },
  rebound_goal: { label: "Abstauber", emoji: "🦊", category: "Tore" },
  rain_goal: { label: "Regentor", emoji: "☔", category: "Wetter" },
  sunshine_goal: { label: "Sonnentor", emoji: "☀️", category: "Wetter" },
  cloudy_goal: { label: "Wolkentor", emoji: "☁️", category: "Wetter" },
  heat_goal: { label: "Hitzetor", emoji: "🔥", category: "Wetter" },
  cold_goal: { label: "Kältetor", emoji: "❄️", category: "Wetter" },

  double_assist_match: { label: "Doppel-Vorlage", emoji: "🎯", category: "Assists" },
  first_15_assist: { label: "Frühe Vorlage", emoji: "🌅", category: "Assists" },
  last_15_assist: { label: "Späte Vorlage", emoji: "🌙", category: "Assists" },
  last_minute_assist: { label: "Spät aufgelegt", emoji: "⏱️", category: "Assists" },
  fast_start_assist: { label: "Früh aufgelegt", emoji: "⚡", category: "Assists" },
  equalizer_assist: { label: "Ausgleich aufgelegt", emoji: "🤲", category: "Assists" },
  comeback_assist: { label: "Comeback aufgelegt", emoji: "🔁", category: "Assists" },
  winning_goal_assist: { label: "Siegtor-Vorlage", emoji: "🏅", category: "Assists" },
  consolation_assist: { label: "Ehrentreffer aufgelegt", emoji: "🪄", category: "Assists" },
  rain_assist: { label: "Regen-Vorlage", emoji: "☔", category: "Wetter" },
  sunshine_assist: { label: "Sonnen-Vorlage", emoji: "☀️", category: "Wetter" },
  cloudy_assist: { label: "Wolken-Vorlage", emoji: "☁️", category: "Wetter" },
  heat_assist: { label: "Hitze-Vorlage", emoji: "🔥", category: "Wetter" },
  cold_assist: { label: "Kälte-Vorlage", emoji: "❄️", category: "Wetter" },
  corner_assist: { label: "Ecken-Vorlage", emoji: "📎", category: "Assists" },

  brace: { label: "Doppelpack", emoji: "⚽⚽", category: "Tore" },
  hattrick: { label: "Hattrick", emoji: "🎩", category: "Tore" },
  mutual_assist_same_match: {
    label: "Blindes Verständnis",
    emoji: "🤝",
    category: "Zusammenspiel",
  },

  clean_sheet: { label: "Wall", emoji: "🧱", category: "Defense" },
  first_half_clean_sheet: { label: "Erste Halbzeit dicht", emoji: "1️⃣", category: "Defense" },
  second_half_clean_sheet: { label: "Zweite Halbzeit dicht", emoji: "2️⃣", category: "Defense" },
  clean_sheet_big_win: { label: "Mauer mit Ansage", emoji: "🏰", category: "Defense" },
  clean_sheet_close_game: { label: "Knapp dicht gehalten", emoji: "🔒", category: "Defense" },
  early_wall: { label: "Früh stabil", emoji: "🛡️", category: "Defense" },
  late_wall: { label: "Spät stabil", emoji: "🧲", category: "Defense" },
  last_minute_defense: { label: "Hinten raus dicht", emoji: "🚧", category: "Defense" },
  clean_sheet_streak_2: { label: "Unüberwindbar", emoji: "🧊", category: "Serien" },
  clean_sheet_streak_3: { label: "Festung", emoji: "🏯", category: "Serien" },
  rain_wall: { label: "Regen-Mauer", emoji: "☔", category: "Wetter" },
  heat_wall: { label: "Hitze-Mauer", emoji: "🔥", category: "Wetter" },
  cold_wall: { label: "Frost-Mauer", emoji: "❄️", category: "Wetter" },

  comeback_win: { label: "Comeback-Sieger", emoji: "💪", category: "Spielverlauf" },
  win_streak_3: { label: "Lauf", emoji: "📈", category: "Serien" },
  win_streak_5: { label: "Heißer Lauf", emoji: "🔥", category: "Serien" },
  win_streak_10: { label: "Legendenlauf", emoji: "👑", category: "Serien" },
  loss_streak_3: { label: "Pechsträhne", emoji: "📉", category: "Serien" },
  loss_streak_5: { label: "Krise", emoji: "🌧️", category: "Serien" },
  loss_streak_10: { label: "Albtraumserie", emoji: "🕳️", category: "Serien" },
  draw_match: { label: "Punkteteiler", emoji: "➗", category: "Spielverlauf" },
  draw_streak_2: { label: "Remis-Serie", emoji: "↔️", category: "Serien" },
};

const FALLBACK_BADGE_META: BadgeMeta = {
  label: "Unbekanntes Badge",
  emoji: "🏅",
  category: "Unbekannt",
};

export function getBadgeMeta(badgeKey: string): BadgeMeta {
  return BADGE_META_BY_KEY[badgeKey as BadgeKey] ?? {
    ...FALLBACK_BADGE_META,
    label: badgeKey,
  };
}

export function getBadgeRarity(ownerCount: number): BadgeRarity | null {
  if (ownerCount <= 0) {
    return null;
  }

  if (ownerCount === 1) {
    return "legendär";
  }

  if (ownerCount <= 3) {
    return "episch";
  }

  if (ownerCount <= 6) {
    return "selten";
  }

  return "häufig";
}
