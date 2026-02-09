#!/usr/bin/env node
/**
 * One-off: connect to DATABASE_URL and report table row counts.
 * Usage: DATABASE_URL="postgresql://..." node scripts/check-db.js
 */
const { Client } = require('pg');

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const client = new Client({ connectionString: url });

async function main() {
  try {
    await client.connect();
    console.log('Connected to database.\n');

    // List tables
    const tablesRes = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('Tables in public schema:', tablesRes.rows.length);
    tablesRes.rows.forEach((r) => console.log('  -', r.table_name));

    // Count rows in key tables (Prisma uses "users", "Collage", "EkmanImage")
    const toCount = ['users', 'Collage', 'EkmanImage', 'FriendRequest', 'Friendship', 'GameSession'];
    console.log('\nRow counts:');
    for (const table of toCount) {
      try {
        const q = await client.query(`SELECT COUNT(*) AS n FROM "${table}"`);
        console.log('  ', table + ':', q.rows[0].n);
      } catch (e) {
        console.log('  ', table + ': (table missing or error)', e.message);
      }
    }

    // Sample one user if any
    const userRes = await client.query('SELECT id, username, role FROM users LIMIT 3');
    if (userRes.rows.length) {
      console.log('\nSample users:', userRes.rows);
    } else {
      console.log('\nNo users in users table.');
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
