export const BADGE_KEYS = {
  // Goal badges
  // Zeit
  WINNING_GOAL: "winning_goal",
  FIRST_15_GOAL: "first_15_goal",
  LAST_15_GOAL: "last_15_goal",
  LAST_MINUTE_GOAL: "last_minute_goal",
  LAST_MINUTE_WINNER: "last_minute_winner",
  LAST_MINUTE_EQUALIZER: "last_minute_equalizer",
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
  ASSIST_STREAK_3: "assist_streak_3",
  ASSIST_STREAK_5: "assist_streak_5",
  ASSIST_STREAK_10: "assist_streak_10",
  APPEARANCE_STREAK_3: "appearance_streak_3",
  APPEARANCE_STREAK_5: "appearance_streak_5",
  APPEARANCE_STREAK_10: "appearance_streak_10",
  APPEARANCE_STREAK_20: "appearance_streak_20",

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
  description: string;
};

export type BadgeRarity = "legendär" | "episch" | "selten" | "häufig";

export const BADGE_META_BY_KEY: Record<BadgeKey, BadgeMeta> = {
  winning_goal: {
    label: "Siegtorschütze",
    emoji: "🏆",
    category: "Tore",
    description: "Tor, das den finalen Sieg sichert.",
  },
  first_15_goal: {
    label: "Früher Treffer",
    emoji: "🌅",
    category: "Tore",
    description: "Tor in den ersten 15 Minuten.",
  },
  last_15_goal: {
    label: "Später Treffer",
    emoji: "🌙",
    category: "Tore",
    description: "Tor in der späten Schlussphase.",
  },
  last_minute_goal: {
    label: "Last Minute",
    emoji: "⏱️",
    category: "Tore",
    description: "Tor ab der 89. Minute.",
  },
  last_minute_winner: {
    label: "Last-Minute-Sieger",
    emoji: "⏱️",
    category: "Tore",
    description: "Echtes Siegtor ab der 89. Minute.",
  },
  last_minute_equalizer: {
    label: "Last-Minute-Ausgleich",
    emoji: "⏱️",
    category: "Tore",
    description: "Echter Ausgleichstreffer ab der 89. Minute.",
  },
  fast_start_goal: {
    label: "Schnellstarter",
    emoji: "⚡",
    category: "Tore",
    description: "Tor direkt in Minute 1.",
  },
  equalizer_goal: {
    label: "Ausgleichstreffer",
    emoji: "⚖️",
    category: "Tore",
    description: "Tor zum zwischenzeitlichen Ausgleich.",
  },
  comeback_goal: {
    label: "Comeback-Tor",
    emoji: "🔄",
    category: "Tore",
    description: "Tor, obwohl das eigene Team zuvor hinten lag.",
  },
  consolation_goal: {
    label: "Ehrentreffer",
    emoji: "🎖️",
    category: "Tore",
    description: "Tor bei klarer Niederlage ohne echte Wende.",
  },
  longshot_goal: {
    label: "Fernschütze",
    emoji: "🚀",
    category: "Tore",
    description: "Tor nach als Longshot markiertem Abschluss.",
  },
  corner_goal: {
    label: "Eckenverwerter",
    emoji: "📐",
    category: "Tore",
    description: "Tor nach Ecke.",
  },
  rebound_goal: {
    label: "Abstauber",
    emoji: "🦊",
    category: "Tore",
    description: "Tor nach Abpraller (Rebound).",
  },
  rain_goal: {
    label: "Regentor",
    emoji: "☔",
    category: "Wetter",
    description: "Tor bei Regen (Niederschlag > 0 mm).",
  },
  sunshine_goal: {
    label: "Sonnentor",
    emoji: "☀️",
    category: "Wetter",
    description: "Tor bei klarem Wetter ohne Regen und ohne Wolkensignal.",
  },
  cloudy_goal: {
    label: "Wolkentor",
    emoji: "☁️",
    category: "Wetter",
    description: "Tor bei wolkigem Wetter ohne Klar-Signal und ohne Regen.",
  },
  heat_goal: {
    label: "Hitzetor",
    emoji: "🔥",
    category: "Wetter",
    description: "Tor bei Hitze über 30°C.",
  },
  cold_goal: {
    label: "Kältetor",
    emoji: "❄️",
    category: "Wetter",
    description: "Tor bei Kälte unter 10°C.",
  },

  double_assist_match: {
    label: "Doppel-Vorlage",
    emoji: "🎯",
    category: "Assists",
    description: "Mindestens zwei Assists in einem Spiel.",
  },
  first_15_assist: {
    label: "Frühe Vorlage",
    emoji: "🌅",
    category: "Assists",
    description: "Assist in den ersten 15 Minuten.",
  },
  last_15_assist: {
    label: "Späte Vorlage",
    emoji: "🌙",
    category: "Assists",
    description: "Assist in der späten Schlussphase.",
  },
  last_minute_assist: {
    label: "Spät aufgelegt",
    emoji: "⏱️",
    category: "Assists",
    description: "Assist ab der 89. Minute.",
  },
  fast_start_assist: {
    label: "Früh aufgelegt",
    emoji: "⚡",
    category: "Assists",
    description: "Assist direkt in Minute 1.",
  },
  equalizer_assist: {
    label: "Ausgleich aufgelegt",
    emoji: "🤲",
    category: "Assists",
    description: "Assist zum zwischenzeitlichen Ausgleich.",
  },
  comeback_assist: {
    label: "Comeback aufgelegt",
    emoji: "🔁",
    category: "Assists",
    description: "Assist, obwohl das eigene Team zuvor hinten lag.",
  },
  winning_goal_assist: {
    label: "Siegtor-Vorlage",
    emoji: "🏅",
    category: "Assists",
    description: "Assist zum späteren Siegtor.",
  },
  consolation_assist: {
    label: "Ehrentreffer aufgelegt",
    emoji: "🪄",
    category: "Assists",
    description: "Assist bei einem Ehrentreffer in klarer Niederlage.",
  },
  rain_assist: {
    label: "Regen-Vorlage",
    emoji: "☔",
    category: "Wetter",
    description: "Assist bei Regen (Niederschlag > 0 mm).",
  },
  sunshine_assist: {
    label: "Sonnen-Vorlage",
    emoji: "☀️",
    category: "Wetter",
    description: "Assist bei klarem Wetter ohne Regen und ohne Wolkensignal.",
  },
  cloudy_assist: {
    label: "Wolken-Vorlage",
    emoji: "☁️",
    category: "Wetter",
    description: "Assist bei wolkigem Wetter ohne Klar-Signal und ohne Regen.",
  },
  heat_assist: {
    label: "Hitze-Vorlage",
    emoji: "🔥",
    category: "Wetter",
    description: "Assist bei Hitze über 30°C.",
  },
  cold_assist: {
    label: "Kälte-Vorlage",
    emoji: "❄️",
    category: "Wetter",
    description: "Assist bei Kälte unter 10°C.",
  },
  corner_assist: {
    label: "Ecken-Vorlage",
    emoji: "📎",
    category: "Assists",
    description: "Assist nach Ecke.",
  },

  brace: {
    label: "Doppelpack",
    emoji: "⚽⚽",
    category: "Tore",
    description: "Mindestens zwei Tore in einem Spiel.",
  },
  hattrick: {
    label: "Hattrick",
    emoji: "🎩",
    category: "Tore",
    description: "Mindestens drei Tore in einem Spiel.",
  },
  mutual_assist_same_match: {
    label: "Blindes Verständnis",
    emoji: "🤝",
    category: "Zusammenspiel",
    description: "Zwei Spieler legen sich im selben Spiel gegenseitig Tore auf.",
  },

  clean_sheet: {
    label: "Wall",
    emoji: "🧱",
    category: "Defense",
    description: "Ohne Gegentor geblieben.",
  },
  first_half_clean_sheet: {
    label: "Erste Halbzeit dicht",
    emoji: "1️⃣",
    category: "Defense",
    description: "In Halbzeit 1 kein Gegentor kassiert.",
  },
  second_half_clean_sheet: {
    label: "Zweite Halbzeit dicht",
    emoji: "2️⃣",
    category: "Defense",
    description: "In Halbzeit 2 kein Gegentor kassiert.",
  },
  clean_sheet_big_win: {
    label: "Mauer mit Ansage",
    emoji: "🏰",
    category: "Defense",
    description: "Zu null gewonnen mit mindestens drei Toren Vorsprung.",
  },
  clean_sheet_close_game: {
    label: "Knapp dicht gehalten",
    emoji: "🔒",
    category: "Defense",
    description: "Zu null gewonnen mit genau einem Tor Vorsprung.",
  },
  early_wall: {
    label: "Früh stabil",
    emoji: "🛡️",
    category: "Defense",
    description: "In den ersten 15 Minuten kein Gegentor kassiert.",
  },
  late_wall: {
    label: "Spät stabil",
    emoji: "🧲",
    category: "Defense",
    description: "In der Schlussphase ohne Gegentor geblieben.",
  },
  last_minute_defense: {
    label: "Hinten raus dicht",
    emoji: "🚧",
    category: "Defense",
    description: "Ab Minute 89 kein Gegentor kassiert.",
  },
  clean_sheet_streak_2: {
    label: "Unüberwindbar",
    emoji: "🧊",
    category: "Serien",
    description: "Zwei Spiele in Folge ohne Gegentor.",
  },
  clean_sheet_streak_3: {
    label: "Festung",
    emoji: "🏯",
    category: "Serien",
    description: "Drei Spiele in Folge ohne Gegentor.",
  },
  assist_streak_3: {
    label: "Vorlagen-Lauf",
    emoji: "🪄",
    category: "Serien",
    description: "Drei Spiele in Folge mit mindestens einer Vorlage.",
  },
  assist_streak_5: {
    label: "Vorlagen-Express",
    emoji: "🚆",
    category: "Serien",
    description: "Fünf Spiele in Folge mit mindestens einer Vorlage.",
  },
  assist_streak_10: {
    label: "Vorlagen-Legende",
    emoji: "👑",
    category: "Serien",
    description: "Zehn Spiele in Folge mit mindestens einer Vorlage.",
  },
  appearance_streak_3: {
    label: "Dauerbrenner",
    emoji: "🟢",
    category: "Serien",
    description: "Drei Spiele in Folge teilgenommen.",
  },
  appearance_streak_5: {
    label: "Immer dabei",
    emoji: "🔁",
    category: "Serien",
    description: "Fünf Spiele in Folge teilgenommen.",
  },
  appearance_streak_10: {
    label: "Stammkraft",
    emoji: "🧷",
    category: "Serien",
    description: "Zehn Spiele in Folge teilgenommen.",
  },
  appearance_streak_20: {
    label: "Dauerläufer",
    emoji: "🏃",
    category: "Serien",
    description: "Zwanzig Spiele in Folge teilgenommen.",
  },
  rain_wall: {
    label: "Regen-Mauer",
    emoji: "☔",
    category: "Wetter",
    description: "Zu-null-Leistung bei Regen.",
  },
  heat_wall: {
    label: "Hitze-Mauer",
    emoji: "🔥",
    category: "Wetter",
    description: "Zu-null-Leistung bei Hitze über 30°C.",
  },
  cold_wall: {
    label: "Frost-Mauer",
    emoji: "❄️",
    category: "Wetter",
    description: "Zu-null-Leistung bei Kälte unter 10°C.",
  },

  comeback_win: {
    label: "Comeback-Sieger",
    emoji: "💪",
    category: "Spielverlauf",
    description: "Spiel gewonnen, obwohl das Team zwischenzeitlich zurücklag.",
  },
  win_streak_3: {
    label: "Lauf",
    emoji: "📈",
    category: "Serien",
    description: "Drei Siege in Folge.",
  },
  win_streak_5: {
    label: "Heißer Lauf",
    emoji: "🔥",
    category: "Serien",
    description: "Fünf Siege in Folge.",
  },
  win_streak_10: {
    label: "Legendenlauf",
    emoji: "👑",
    category: "Serien",
    description: "Zehn Siege in Folge.",
  },
  loss_streak_3: {
    label: "Pechsträhne",
    emoji: "📉",
    category: "Serien",
    description: "Drei Niederlagen in Folge.",
  },
  loss_streak_5: {
    label: "Krise",
    emoji: "🌧️",
    category: "Serien",
    description: "Fünf Niederlagen in Folge.",
  },
  loss_streak_10: {
    label: "Albtraumserie",
    emoji: "🕳️",
    category: "Serien",
    description: "Zehn Niederlagen in Folge.",
  },
  draw_match: {
    label: "Punkteteiler",
    emoji: "➗",
    category: "Spielverlauf",
    description: "Spiel endet unentschieden.",
  },
  draw_streak_2: {
    label: "Remis-Serie",
    emoji: "↔️",
    category: "Serien",
    description: "Zwei Unentschieden in Folge.",
  },
};

const FALLBACK_BADGE_META: BadgeMeta = {
  label: "Unbekanntes Badge",
  emoji: "🏅",
  category: "Unbekannt",
  description: "Keine Beschreibung für dieses Badge vorhanden.",
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
