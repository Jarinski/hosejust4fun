require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function checkDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const seasonsResult = await client.query(
      'SELECT id, name, start_date, end_date FROM seasons ORDER BY id DESC'
    );
    console.log('=== seasons ===');
    console.table(seasonsResult.rows);

    const matchesResult = await client.query(
      'SELECT id, season_id, match_date, team_1_name, team_2_name, team_1_score, team_2_score, location, notes FROM matches ORDER BY id DESC'
    );
    console.log('=== matches ===');
    console.table(matchesResult.rows);

    const playersResult = await client.query(
      'SELECT id, name FROM players ORDER BY id DESC LIMIT 30'
    );
    console.log('=== players ===');
    console.table(playersResult.rows);
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

checkDb();