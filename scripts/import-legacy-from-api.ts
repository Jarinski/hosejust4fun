import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ path: ".env.local" });

const PLAYERS_ENDPOINT = "https://hose-just4fun.de/wp-json/sportspress/v2/players";
const EVENTS_ENDPOINT = "https://hose-just4fun.de/wp-json/sportspress/v2/events";
const PER_PAGE = 100;
const LEGACY_SOURCE = "sportspress";
const SEASON_LABEL = "Pre-2026";

const DATABASE_URL_CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
] as const;

type UnknownRecord = Record<string, unknown>;

type PlayerNameMap = Map<number, string>;

type LegacyStatRow = {
  legacyEventId: number;
  legacyPlayerId: number;
  playerName: string;
  matchDate: string | null;
  seasonLabel: string;
  teamLabel: string;
  opponentLabel: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
};

type Outcome = "win" | "draw" | "loss";

type ColumnMap = {
  source: string;
  legacyEventId: string;
  legacyPlayerId: string;
  playerName: string;
  matchDate: string;
  seasonLabel: string;
  teamLabel: string;
  opponentLabel: string;
  games: string;
  wins: string;
  draws: string;
  losses: string;
  goals: string;
  assists: string;
};

type MappingColumnMap = {
  source?: string;
  legacyPlayerId?: string;
  playerName?: string;
};

function resolveDatabaseUrl(): string {
  for (const key of DATABASE_URL_CANDIDATES) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(
    `Keine DB-URL gefunden. Setze eine dieser Variablen: ${DATABASE_URL_CANDIDATES.join(", ")}.`
  );
}

async function fetchPaginated(endpoint: string): Promise<unknown[]> {
  const allItems: unknown[] = [];
  let page = 1;
  let totalPages: number | null = null;

  while (true) {
    const url = new URL(endpoint);
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Fehler beim Laden von ${url.toString()}: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as unknown;
    const items = Array.isArray(body) ? body : [];

    const headerTotalPages = response.headers.get("x-wp-totalpages");
    if (totalPages === null && headerTotalPages) {
      const parsed = Number.parseInt(headerTotalPages, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        totalPages = parsed;
      }
    }

    console.log(
      `[fetch] ${endpoint} page ${page}${totalPages ? `/${totalPages}` : ""} -> ${items.length} Einträge`
    );

    if (items.length === 0) {
      break;
    }

    allItems.push(...items);

    if (totalPages !== null && page >= totalPages) {
      break;
    }

    page += 1;
  }

  return allItems;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return null;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractRenderedTitle(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const rendered = record.rendered;
  return typeof rendered === "string" ? rendered.trim() : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getPlayerNameMap(players: unknown[]): PlayerNameMap {
  const map = new Map<number, string>();

  for (const raw of players) {
    const player = asRecord(raw);
    if (!player) {
      continue;
    }

    const id = toInt(player.id);
    if (id === null) {
      continue;
    }

    const title = extractRenderedTitle(player.title) ?? `Legacy Spieler ${id}`;
    map.set(id, title);
  }

  return map;
}

function toComparable(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(columns: string[], candidates: string[]): string | undefined {
  const byComparable = new Map(columns.map((col) => [toComparable(col), col]));
  for (const candidate of candidates) {
    const hit = byComparable.get(toComparable(candidate));
    if (hit) {
      return hit;
    }
  }
  return undefined;
}

async function getTableColumns(pool: Pool, tableName: string): Promise<string[]> {
  const result = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows.map((row: { column_name: string }) => row.column_name);
}

async function resolveStatsColumnMap(pool: Pool): Promise<ColumnMap> {
  const columns = await getTableColumns(pool, "legacy_player_match_stats");

  if (columns.length === 0) {
    throw new Error("Tabelle public.legacy_player_match_stats nicht gefunden.");
  }

  const source = findColumn(columns, ["legacySource", "legacy_source", "source"]);
  const legacyEventId = findColumn(columns, ["legacyEventId", "legacy_event_id"]);
  const legacyPlayerId = findColumn(columns, ["legacyPlayerId", "legacy_player_id"]);
  const playerName = findColumn(columns, ["legacyPlayerName", "legacy_player_name", "playerName", "player_name"]);
  const matchDate = findColumn(columns, ["matchDate", "match_date"]);
  const seasonLabel = findColumn(columns, ["seasonLabel", "season_label"]);
  const teamLabel = findColumn(columns, ["teamLabel", "team_label"]);
  const opponentLabel = findColumn(columns, ["opponentLabel", "opponent_label"]);
  const games = findColumn(columns, ["games"]);
  const wins = findColumn(columns, ["wins"]);
  const draws = findColumn(columns, ["draws"]);
  const losses = findColumn(columns, ["losses"]);
  const goals = findColumn(columns, ["goals"]);
  const assists = findColumn(columns, ["assists"]);

  const requiredEntries = {
    source,
    legacyEventId,
    legacyPlayerId,
    playerName,
    matchDate,
    seasonLabel,
    teamLabel,
    opponentLabel,
    games,
    wins,
    draws,
    losses,
    goals,
    assists,
  } as const;

  const missing = Object.entries(requiredEntries)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `In legacy_player_match_stats fehlen erwartete Spalten: ${missing.join(", ")} (gefunden: ${columns.join(
        ", "
      )})`
    );
  }

  return requiredEntries as ColumnMap;
}

async function resolveMappingColumnMap(pool: Pool): Promise<MappingColumnMap | null> {
  const columns = await getTableColumns(pool, "legacy_player_mapping");

  if (columns.length === 0) {
    console.warn("[mapping] Tabelle public.legacy_player_mapping nicht gefunden. Mapping wird übersprungen.");
    return null;
  }

  const source = findColumn(columns, ["legacySource", "legacy_source", "source"]);
  const legacyPlayerId = findColumn(columns, ["legacyPlayerId", "legacy_player_id"]);
  const playerName = findColumn(columns, [
    "legacyPlayerName",
    "legacy_player_name",
    "playerName",
    "player_name",
  ]);

  if (!legacyPlayerId) {
    console.warn(
      "[mapping] Keine passende Legacy-Player-ID-Spalte in legacy_player_mapping gefunden. Mapping wird übersprungen."
    );
    return null;
  }

  if (!playerName) {
    console.warn(
      "[mapping] Keine passende Legacy-Player-Name-Spalte in legacy_player_mapping gefunden. Mapping wird übersprungen."
    );
    return null;
  }

  return {
    source,
    legacyPlayerId,
    playerName,
  };
}

function getTeamInfos(event: UnknownRecord): { keys: string[]; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  const keys: string[] = [];

  const teamsRaw = event.teams;
  if (Array.isArray(teamsRaw)) {
    for (const rawTeam of teamsRaw) {
      if (typeof rawTeam === "number" || typeof rawTeam === "string") {
        const key = String(rawTeam);
        if (!keys.includes(key)) {
          keys.push(key);
        }
        if (!labels.has(key)) {
          labels.set(key, key);
        }
        continue;
      }

      const teamRecord = asRecord(rawTeam);
      if (!teamRecord) {
        continue;
      }

      const id = toInt(teamRecord.id);
      const key = id !== null ? String(id) : typeof teamRecord.slug === "string" ? teamRecord.slug : null;
      if (!key) {
        continue;
      }

      if (!keys.includes(key)) {
        keys.push(key);
      }

      const labelCandidates: Array<unknown> = [
        teamRecord.name,
        extractRenderedTitle(teamRecord.title),
        teamRecord.slug,
      ];
      const label = labelCandidates.find((item) => typeof item === "string" && item.trim().length > 0) as
        | string
        | undefined;

      if (label) {
        labels.set(key, label.trim());
      }
    }
  }

  const mainResults = asRecord(event.main_results);
  if (mainResults) {
    for (const key of Object.keys(mainResults)) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
      if (!labels.has(key)) {
        labels.set(key, key);
      }
    }
  }

  const performance = asRecord(event.performance);
  if (performance) {
    for (const key of Object.keys(performance)) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
      if (!labels.has(key)) {
        labels.set(key, key);
      }
    }
  }

  return { keys, labels };
}

function extractScore(value: unknown): number | null {
  const numericDirect = toInt(value);
  if (numericDirect !== null) {
    return numericDirect;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const scoreLike = trimmed.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
    if (scoreLike) {
      return Number.parseInt(scoreLike[1], 10);
    }
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const candidateKeys = ["goals", "score", "total", "value", "main", "result"];
  for (const key of candidateKeys) {
    const parsed = toInt(record[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const parsed = extractScore(nestedValue);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function getScoresByTeam(event: UnknownRecord, teamKeys: string[]): Map<string, number> {
  const scores = new Map<string, number>();
  const mainResults = asRecord(event.main_results);

  if (!mainResults) {
    return scores;
  }

  for (const teamKey of teamKeys) {
    const raw = mainResults[teamKey];
    const parsed = extractScore(raw);
    if (parsed !== null) {
      scores.set(teamKey, parsed);
    }
  }

  if (scores.size === 0) {
    for (const [teamKey, raw] of Object.entries(mainResults)) {
      const parsed = extractScore(raw);
      if (parsed !== null) {
        scores.set(teamKey, parsed);
      }
    }
  }

  return scores;
}

function determineResultFlags(teamScore: number | null, opponentScore: number | null) {
  if (teamScore === null || opponentScore === null) {
    return { wins: 0, draws: 0, losses: 0 };
  }

  if (teamScore > opponentScore) {
    return { wins: 1, draws: 0, losses: 0 };
  }
  if (teamScore < opponentScore) {
    return { wins: 0, draws: 0, losses: 1 };
  }
  return { wins: 0, draws: 1, losses: 0 };
}

function normalizeOutcome(value: unknown): Outcome | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["win", "won", "sieg", "gewonnen", "w"].includes(normalized)) {
    return "win";
  }
  if (["draw", "remis", "unentschieden", "d"].includes(normalized)) {
    return "draw";
  }
  if (["loss", "lost", "lose", "niederlage", "verloren", "l"].includes(normalized)) {
    return "loss";
  }

  return null;
}

function getOutcomesByTeam(event: UnknownRecord, teamKeys: string[]): Map<string, Outcome> {
  const outcomes = new Map<string, Outcome>();
  const sources = [asRecord(event.main_results), asRecord((event as UnknownRecord).results)].filter(
    (value): value is UnknownRecord => Boolean(value)
  );

  for (const source of sources) {
    for (const teamKey of teamKeys) {
      const raw = source[teamKey];
      if (raw === undefined) {
        continue;
      }

      const directOutcome = normalizeOutcome(raw);
      if (directOutcome) {
        outcomes.set(teamKey, directOutcome);
        continue;
      }

      const rawRecord = asRecord(raw);
      if (!rawRecord) {
        continue;
      }

      for (const candidateKey of ["outcome", "result", "winner"]) {
        const candidateOutcome = normalizeOutcome(rawRecord[candidateKey]);
        if (candidateOutcome) {
          outcomes.set(teamKey, candidateOutcome);
          break;
        }
      }
    }
  }

  return outcomes;
}

function determineResultFlagsForTeam(
  teamKey: string,
  opponentKey: string | null,
  outcomes: Map<string, Outcome>,
  scores: Map<string, number>
) {
  const outcome = outcomes.get(teamKey);
  if (outcome === "win") {
    return { wins: 1, draws: 0, losses: 0 };
  }
  if (outcome === "draw") {
    return { wins: 0, draws: 1, losses: 0 };
  }
  if (outcome === "loss") {
    return { wins: 0, draws: 0, losses: 1 };
  }

  const teamScore = scores.get(teamKey) ?? null;
  const opponentScore = opponentKey ? (scores.get(opponentKey) ?? null) : null;
  return determineResultFlags(teamScore, opponentScore);
}

function transformEventsToStats(events: unknown[], playerNames: PlayerNameMap): LegacyStatRow[] {
  const rows: LegacyStatRow[] = [];
  let eventsWithoutPerformance = 0;
  let skippedInvalidPlayerIds = 0;

  for (const rawEvent of events) {
    const event = asRecord(rawEvent);
    if (!event) {
      continue;
    }

    const legacyEventId = toInt(event.id);
    if (legacyEventId === null) {
      continue;
    }

    const performance = asRecord(event.performance);
    if (!performance) {
      eventsWithoutPerformance += 1;
      continue;
    }

    const matchDate = normalizeDate(event.date);
    const { keys: teamKeys, labels: teamLabels } = getTeamInfos(event);
    const scores = getScoresByTeam(event, teamKeys);
    const outcomes = getOutcomesByTeam(event, teamKeys);

    for (const [teamKey, teamPlayersRaw] of Object.entries(performance)) {
      const teamPlayers = asRecord(teamPlayersRaw);
      if (!teamPlayers) {
        continue;
      }

      const teamLabel = teamLabels.get(teamKey) ?? teamKey;

      const opponentKey = teamKeys.find((key) => key !== teamKey) ?? null;
      const opponentLabel = opponentKey ? (teamLabels.get(opponentKey) ?? opponentKey) : null;

      const { wins, draws, losses } = determineResultFlagsForTeam(teamKey, opponentKey, outcomes, scores);

      for (const [playerKey, playerStatRaw] of Object.entries(teamPlayers)) {
        const legacyPlayerId = toInt(playerKey);
        if (legacyPlayerId === null || legacyPlayerId <= 0) {
          skippedInvalidPlayerIds += 1;
          continue;
        }

        const playerStat = asRecord(playerStatRaw) ?? {};
        const goals = toInt(playerStat.goals) ?? 0;
        const assists = toInt(playerStat.assists) ?? 0;

        const playerName = playerNames.get(legacyPlayerId) ?? `Legacy Spieler ${legacyPlayerId}`;

        rows.push({
          legacyEventId,
          legacyPlayerId,
          playerName,
          matchDate,
          seasonLabel: SEASON_LABEL,
          teamLabel,
          opponentLabel,
          games: 1,
          wins,
          draws,
          losses,
          goals,
          assists,
        });
      }
    }
  }

  console.log(`[transform] Events ohne performance: ${eventsWithoutPerformance}`);
  console.log(`[transform] Übersprungene Stat-Zeilen (ungültige legacy_player_id): ${skippedInvalidPlayerIds}`);
  console.log(`[transform] Erzeugte Roh-Statzeilen: ${rows.length}`);

  return rows;
}

function dedupeStatRows(rows: LegacyStatRow[]): LegacyStatRow[] {
  const byKey = new Map<string, LegacyStatRow>();

  for (const row of rows) {
    const key = `${row.legacyEventId}:${row.legacyPlayerId}`;
    if (!byKey.has(key)) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

async function loadExistingStatKeys(pool: Pool, columns: ColumnMap): Promise<Set<string>> {
  const query = `
    SELECT "${columns.legacyEventId}" AS legacy_event_id, "${columns.legacyPlayerId}" AS legacy_player_id
    FROM "legacy_player_match_stats"
    WHERE "${columns.source}" = $1
  `;

  const result = await pool.query<{ legacy_event_id: number | string; legacy_player_id: number | string }>(query, [
    LEGACY_SOURCE,
  ]);

  const set = new Set<string>();
  for (const row of result.rows) {
    const eventId = toInt(row.legacy_event_id);
    const playerId = toInt(row.legacy_player_id);
    if (eventId !== null && playerId !== null) {
      set.add(`${eventId}:${playerId}`);
    }
  }

  return set;
}

function buildInsertQuery(tableName: string, columns: string[], rowCount: number, onConflictDoNothing = false): string {
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");

  const valuesClauses: string[] = [];
  let parameterIndex = 1;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const placeholders: string[] = [];
    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      placeholders.push(`$${parameterIndex}`);
      parameterIndex += 1;
    }
    valuesClauses.push(`(${placeholders.join(", ")})`);
  }

  const conflictSuffix = onConflictDoNothing ? " ON CONFLICT DO NOTHING" : "";

  return `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${valuesClauses.join(", ")}${conflictSuffix}`;
}

async function insertLegacyStats(pool: Pool, columns: ColumnMap, rows: LegacyStatRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const BATCH_SIZE = 500;
  const insertColumns = [
    columns.source,
    columns.legacyEventId,
    columns.legacyPlayerId,
    columns.playerName,
    columns.matchDate,
    columns.seasonLabel,
    columns.teamLabel,
    columns.opponentLabel,
    columns.games,
    columns.wins,
    columns.draws,
    columns.losses,
    columns.goals,
    columns.assists,
  ];

  let inserted = 0;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values: unknown[] = [];

    for (const row of batch) {
      values.push(
        LEGACY_SOURCE,
        row.legacyEventId,
        row.legacyPlayerId,
        row.playerName,
        row.matchDate,
        row.seasonLabel,
        row.teamLabel,
        row.opponentLabel,
        row.games,
        row.wins,
        row.draws,
        row.losses,
        row.goals,
        row.assists
      );
    }

    const query = buildInsertQuery("legacy_player_match_stats", insertColumns, batch.length, true);
    const result = await pool.query(query, values);
    inserted += result.rowCount ?? 0;

    console.log(`[insert:stats] Batch ${Math.floor(offset / BATCH_SIZE) + 1} -> ${batch.length} Zeilen verarbeitet`);
  }

  return inserted;
}

async function insertLegacyPlayerMapping(pool: Pool, columns: MappingColumnMap | null, playerNames: PlayerNameMap) {
  if (!columns?.legacyPlayerId || !columns.playerName) {
    return 0;
  }

  const statsResult = await pool.query<{ legacy_player_id: number | string; player_name: string | null }>(`
    SELECT legacy_player_id, player_name
    FROM legacy_player_match_stats
    WHERE legacy_source = $1
  `, [LEGACY_SOURCE]);

  const playerNamesFromStats = new Map<number, string>();
  for (const row of statsResult.rows) {
    const legacyPlayerId = toInt(row.legacy_player_id);
    const playerName = typeof row.player_name === "string" ? row.player_name.trim() : "";
    if (legacyPlayerId === null || !playerName) {
      continue;
    }
    if (!playerNamesFromStats.has(legacyPlayerId)) {
      playerNamesFromStats.set(legacyPlayerId, playerName);
    }
  }

  const allLegacyPlayerIds = new Set<number>([
    ...playerNames.keys(),
    ...playerNamesFromStats.keys(),
  ]);

  const resolvedRows: Array<{ legacyPlayerId: number; playerName: string }> = [];
  const missingNameIds: number[] = [];

  for (const legacyPlayerId of allLegacyPlayerIds) {
    const fromPlayers = playerNames.get(legacyPlayerId)?.trim();
    const fromStats = playerNamesFromStats.get(legacyPlayerId)?.trim();
    const resolvedName = fromPlayers || fromStats;

    if (!resolvedName) {
      missingNameIds.push(legacyPlayerId);
      continue;
    }

    resolvedRows.push({ legacyPlayerId, playerName: resolvedName });
  }

  if (missingNameIds.length > 0) {
    console.warn(
      `[mapping] Übersprungen (kein Name): ${missingNameIds.length} Spieler-IDs -> ${missingNameIds.join(", ")}`
    );
  } else {
    console.log("[mapping] Keine Mapping-Zeilen wegen fehlendem Namen übersprungen.");
  }

  const insertColumns: string[] = [columns.legacyPlayerId];
  if (columns.source) {
    insertColumns.push(columns.source);
  }
  insertColumns.push(columns.playerName);

  if (insertColumns.length === 0) {
    return 0;
  }

  if (resolvedRows.length === 0) {
    return 0;
  }

  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let offset = 0; offset < resolvedRows.length; offset += BATCH_SIZE) {
    const batch = resolvedRows.slice(offset, offset + BATCH_SIZE);
    const values: unknown[] = [];

    for (const row of batch) {
      values.push(row.legacyPlayerId);
      if (columns.source) {
        values.push(LEGACY_SOURCE);
      }
      values.push(row.playerName);
    }

    const query = buildInsertQuery("legacy_player_mapping", insertColumns, batch.length, true);
    const result = await pool.query(query, values);
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  const resetStats = process.argv.includes("--reset-stats");

  try {
    console.log("[start] Lade Legacy-Players aus Sportspress API...");
    const players = await fetchPaginated(PLAYERS_ENDPOINT);
    const playerNames = getPlayerNameMap(players);
    console.log(`[players] Geladene Spieler: ${playerNames.size}`);

    console.log("[start] Lade Legacy-Events aus Sportspress API...");
    const events = await fetchPaginated(EVENTS_ENDPOINT);
    console.log(`[events] Geladene Events: ${events.length}`);

    const statsColumns = await resolveStatsColumnMap(pool);
    const mappingColumns = await resolveMappingColumnMap(pool);

    const transformedRows = transformEventsToStats(events, playerNames);
    const dedupedRows = dedupeStatRows(transformedRows);

    console.log(`[transform] Nach Dedupe (event_id + player_id): ${dedupedRows.length} Zeilen`);

    if (resetStats) {
      const deleteResult = await pool.query(
        `DELETE FROM legacy_player_match_stats WHERE legacy_source = $1`,
        [LEGACY_SOURCE]
      );
      console.log(`[reset] --reset-stats aktiv: ${deleteResult.rowCount ?? 0} bestehende Stat-Zeilen gelöscht.`);
    }

    const existingKeys = await loadExistingStatKeys(pool, statsColumns);
    const newRows = dedupedRows.filter(
      (row) => !existingKeys.has(`${row.legacyEventId}:${row.legacyPlayerId}`)
    );

    console.log(`[idempotenz] Bereits vorhanden: ${dedupedRows.length - newRows.length}`);
    console.log(`[idempotenz] Neu zu importieren: ${newRows.length}`);

    const insertedStats = await insertLegacyStats(pool, statsColumns, newRows);
    const insertedMapping = await insertLegacyPlayerMapping(pool, mappingColumns, playerNames);

    console.log("[done] Legacy-Import abgeschlossen.");
    console.log(
      JSON.stringify(
        {
          playersFetched: playerNames.size,
          eventsFetched: events.length,
          statsPrepared: dedupedRows.length,
          statsInserted: insertedStats,
          mappingInserted: insertedMapping,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[error] Legacy-Import fehlgeschlagen:", error);
  process.exit(1);
});
