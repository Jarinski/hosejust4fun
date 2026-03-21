require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const players = [
  'Christian Bartz',
  'Jari Gonzales',
  'Jens Mergenthal',
  'Lars Finck',
  'Lars Follmann',
  'Michael Blümig',
  'Torsten Krüger',
  'Wolfgang Hübsch',
  'Björn Steinhardt',
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

async function insertPlayers() {
  try {
    await client.connect();

    const inserted = await client.query(
      `
      WITH input_players(name) AS (
        SELECT * FROM unnest($1::text[])
      )
      INSERT INTO players (name, is_active)
      SELECT ip.name, true
      FROM input_players ip
      WHERE NOT EXISTS (
        SELECT 1
        FROM players p
        WHERE p.name = ip.name
      )
      RETURNING id, name
      `,
      [players]
    );

    console.log('Neu eingefügte Spieler:');
    console.table(inserted.rows);

    const total = await client.query('SELECT COUNT(*)::int AS count FROM players');
    console.log('Spieler gesamt:', total.rows[0].count);
  } catch (error) {
    console.error('Fehler:', error.message);
  } finally {
    await client.end();
  }
}

insertPlayers();