require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const team1 = [
  'Christian Bartz',
  'Jari Gonzales',
  'Jens Mergenthal',
  'Lars Finck',
  'Lars Follmann',
  'Michael Blümig',
  'Torsten Krüger',
  'Wolfgang Hübsch',
  'Björn Steinhardt',
];

const team2 = [
  'Andreas Weseloh',
  'Christian Stille',
  'Felix Kroppenstedt',
  'Jörg Paßlack',
  'Kiri Papouloglou',
  'Marcus Schünzel',
  'Olaf Steinitz',
  'Sven Lehmann',
  'Till Romainschick',
  'Florian Wiards',
];

const participants = [
  ...team1.map((name) => ({ name, teamSide: 'team_1' })),
  ...team2.map((name) => ({ name, teamSide: 'team_2' })),
];

async function insertParticipants() {
  try {
    await client.connect();

    const matchCheck = await client.query('SELECT id FROM matches WHERE id = 1');
    if (matchCheck.rowCount === 0) {
      throw new Error('Match mit id=1 nicht gefunden');
    }

    const insertedRows = [];

    for (const participant of participants) {
      const playerResult = await client.query('SELECT id FROM players WHERE name = $1', [participant.name]);

      if (playerResult.rowCount === 0) {
        throw new Error(`Spieler nicht gefunden: ${participant.name}`);
      }

      const playerId = playerResult.rows[0].id;

      const insertResult = await client.query(
        `
        INSERT INTO match_participants (match_id, player_id, team_side)
        SELECT 1, $1, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM match_participants
          WHERE match_id = 1
            AND player_id = $1
        )
        RETURNING id, match_id, player_id, team_side
        `,
        [playerId, participant.teamSide]
      );

      insertedRows.push(...insertResult.rows);
    }

    console.log('Neu eingefügte Teilnehmer:');
    console.table(insertedRows);

    const total = await client.query(
      'SELECT COUNT(*)::int AS count FROM match_participants WHERE match_id = 1'
    );
    console.log('Teilnehmer für Match 1:', total.rows[0].count);
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

insertParticipants();