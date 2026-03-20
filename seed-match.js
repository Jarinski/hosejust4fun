const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL fehlt in .env.local');
  process.exit(1);
}

const sql = `
BEGIN;

WITH input_players(name) AS (
  VALUES
    ('Christian Bartz'),
    ('Jari Gonzales'),
    ('Jens Mergenthal'),
    ('Lars Finck'),
    ('Lars Follmann'),
    ('Michael Blümig'),
    ('Torsten Krüger'),
    ('Wolfgang Hübsch'),
    ('Björn Steinhardt'),
    ('Andreas Weseloh'),
    ('Christian Stille'),
    ('Felix Kroppenstedt'),
    ('Jörg Paßlack'),
    ('Kiri Papouloglou'),
    ('Marcus Schünzel'),
    ('Olaf Steinitz'),
    ('Sven Lehmann'),
    ('Till Romainschick'),
    ('Florian Wiards')
)
INSERT INTO players (name, is_active)
SELECT ip.name, true
FROM input_players ip
WHERE NOT EXISTS (
  SELECT 1
  FROM players p
  WHERE p.name = ip.name
);

INSERT INTO seasons (name, start_date, end_date, is_active)
SELECT 'Sommersaison 2026', DATE '2026-01-01', DATE '2026-12-31', true
WHERE NOT EXISTS (
  SELECT 1
  FROM seasons s
  WHERE s.name = 'Sommersaison 2026'
);

INSERT INTO matches (title, match_date, season_id)
SELECT 'HoSe Liga – 16.03.2026', DATE '2026-03-16', s.id
FROM seasons s
WHERE s.name = 'Sommersaison 2026'
  AND NOT EXISTS (
    SELECT 1
    FROM matches m
    WHERE m.title = 'HoSe Liga – 16.03.2026'
      AND m.match_date = DATE '2026-03-16'
  );

WITH match_ctx AS (
  SELECT m.id
  FROM matches m
  WHERE m.title = 'HoSe Liga – 16.03.2026'
    AND m.match_date = DATE '2026-03-16'
  ORDER BY m.id DESC
  LIMIT 1
),
participants(name, team_side) AS (
  VALUES
    ('Christian Bartz', 'team_1'),
    ('Jari Gonzales', 'team_1'),
    ('Jens Mergenthal', 'team_1'),
    ('Lars Finck', 'team_1'),
    ('Lars Follmann', 'team_1'),
    ('Michael Blümig', 'team_1'),
    ('Torsten Krüger', 'team_1'),
    ('Wolfgang Hübsch', 'team_1'),
    ('Björn Steinhardt', 'team_1'),
    ('Andreas Weseloh', 'team_2'),
    ('Christian Stille', 'team_2'),
    ('Felix Kroppenstedt', 'team_2'),
    ('Jörg Paßlack', 'team_2'),
    ('Kiri Papouloglou', 'team_2'),
    ('Marcus Schünzel', 'team_2'),
    ('Olaf Steinitz', 'team_2'),
    ('Sven Lehmann', 'team_2'),
    ('Till Romainschick', 'team_2'),
    ('Florian Wiards', 'team_2')
)
INSERT INTO match_participants (match_id, player_id, team_side)
SELECT mc.id, p.id, pr.team_side
FROM match_ctx mc
JOIN participants pr ON true
JOIN players p ON p.name = pr.name
WHERE NOT EXISTS (
  SELECT 1
  FROM match_participants mp
  WHERE mp.match_id = mc.id
    AND mp.player_id = p.id
);

WITH match_ctx AS (
  SELECT m.id
  FROM matches m
  WHERE m.title = 'HoSe Liga – 16.03.2026'
    AND m.match_date = DATE '2026-03-16'
  ORDER BY m.id DESC
  LIMIT 1
),
goal_input(scorer_name, assist_name, minute, team_side) AS (
  VALUES
    ('Lars Follmann', NULL, 25, 'team_1'),
    ('Christian Bartz', NULL, 32, 'team_1'),
    ('Jens Mergenthal', NULL, 36, 'team_1'),
    ('Christian Bartz', NULL, 41, 'team_1'),
    ('Florian Wiards', NULL, 13, 'team_2'),
    ('Sven Lehmann', NULL, 45, 'team_2'),
    ('Sven Lehmann', NULL, 73, 'team_2'),
    ('Michael Blümig', NULL, 75, 'team_1'),
    ('Michael Blümig', NULL, 84, 'team_1')
)
INSERT INTO goal_events (match_id, scorer_player_id, assist_player_id, minute, team_side, goal_type)
SELECT
  mc.id,
  scorer.id,
  assist.id,
  gi.minute,
  gi.team_side,
  'normal'
FROM match_ctx mc
JOIN goal_input gi ON true
JOIN players scorer ON scorer.name = gi.scorer_name
LEFT JOIN players assist ON assist.name = gi.assist_name
WHERE NOT EXISTS (
  SELECT 1
  FROM goal_events ge
  WHERE ge.match_id = mc.id
    AND ge.scorer_player_id = scorer.id
    AND ge.minute = gi.minute
);

COMMIT;
`;

(async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query(sql);
    console.log('Seed erfolgreich eingefügt.');
  } catch (error) {
    console.error('Fehler beim Seed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
