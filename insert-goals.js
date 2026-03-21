require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const goals = [
  { name: 'Florian Wiards', minute: 13, teamSide: 'team_2', goalType: 'normal', assistName: null },
  { name: 'Lars Follmann', minute: 25, teamSide: 'team_1', goalType: 'normal', assistName: null },
  { name: 'Christian Bartz', minute: 32, teamSide: 'team_1', goalType: 'normal', assistName: 'Lars Follmann' },
  { name: 'Jens Mergenthal', minute: 36, teamSide: 'team_1', goalType: 'normal', assistName: 'Björn Steinhardt' },
  { name: 'Christian Bartz', minute: 41, teamSide: 'team_1', goalType: 'normal', assistName: 'Michael Blümig' },
  { name: 'Sven Lehmann', minute: 45, teamSide: 'team_2', goalType: 'normal', assistName: 'Christian Stille' },
  { name: 'Sven Lehmann', minute: 73, teamSide: 'team_2', goalType: 'normal', assistName: 'Till Romainschick' },
  { name: 'Michael Blümig', minute: 75, teamSide: 'team_1', goalType: 'normal', assistName: 'Jari Gonzales' },
  { name: 'Michael Blümig', minute: 84, teamSide: 'team_1', goalType: 'normal', assistName: null },
];

async function insertGoals() {
  try {
    await client.connect();

    const matchCheck = await client.query('SELECT id FROM matches WHERE id = 1');
    if (matchCheck.rowCount === 0) {
      throw new Error('Match mit id=1 nicht gefunden');
    }

    const insertedRows = [];

    for (const goal of goals) {
      const playerResult = await client.query('SELECT id FROM players WHERE name = $1', [goal.name]);

      if (playerResult.rowCount === 0) {
        throw new Error(`Spieler nicht gefunden: ${goal.name}`);
      }

      const scorerPlayerId = playerResult.rows[0].id;
      let assistPlayerId = null;

      if (goal.assistName) {
        const assistResult = await client.query('SELECT id FROM players WHERE name = $1', [goal.assistName]);

        if (assistResult.rowCount === 0) {
          throw new Error(`Vorlagengeber nicht gefunden: ${goal.assistName}`);
        }

        assistPlayerId = assistResult.rows[0].id;
      }

      const insertResult = await client.query(
        `
        INSERT INTO goal_events (match_id, team_side, scorer_player_id, assist_player_id, minute, goal_type)
        SELECT 1, $1, $2, $3, $4, $5
        WHERE NOT EXISTS (
          SELECT 1
          FROM goal_events
          WHERE match_id = 1
            AND scorer_player_id = $2
            AND minute = $4
        )
        RETURNING id, match_id, team_side, scorer_player_id, assist_player_id, minute, goal_type
        `,
        [goal.teamSide, scorerPlayerId, assistPlayerId, goal.minute, goal.goalType]
      );

      insertedRows.push(...insertResult.rows);
    }

    console.log('Neu eingefügte Tore:');
    console.table(insertedRows);

    const total = await client.query(
      'SELECT COUNT(*)::int AS count FROM goal_events WHERE match_id = 1'
    );
    console.log('Tore für Match 1:', total.rows[0].count);
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

insertGoals();