// Migration script: SQLite -> PostgreSQL
// Run this ONCE to migrate existing users from SQLite to PostgreSQL
// Usage: node migrate-to-postgres.js

const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

async function migrate() {
  console.log('🚀 Starting migration from SQLite to PostgreSQL...\n');

  // Connect to SQLite (local database)
  const sqlitePath = path.join(__dirname, 'data', 'app.db');
  console.log(`📂 Reading SQLite database: ${sqlitePath}`);
  
  let sqliteDb;
  try {
    sqliteDb = new Database(sqlitePath, { readonly: true });
  } catch (e) {
    console.error('❌ Could not open SQLite database:', e.message);
    console.log('💡 Make sure backend/data/app.db exists');
    process.exit(1);
  }

  // Get all users from SQLite
  const users = sqliteDb.prepare('SELECT id, email, password, created_at FROM users').all();
  console.log(`✅ Found ${users.length} users in SQLite\n`);

  if (users.length === 0) {
    console.log('ℹ️  No users to migrate. Exiting.');
    sqliteDb.close();
    process.exit(0);
  }

  // Connect to PostgreSQL
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL || !DATABASE_URL.startsWith('postgresql://')) {
    console.error('❌ DATABASE_URL environment variable not set or invalid');
    console.log('💡 Set DATABASE_URL to your PostgreSQL connection string');
    process.exit(1);
  }

  console.log('🔌 Connecting to PostgreSQL...');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL\n');

    // Ensure users table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        email      TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Check if PostgreSQL already has users
    const existingCount = await pool.query('SELECT COUNT(*) FROM users');
    const existingUsers = parseInt(existingCount.rows[0].count);
    
    if (existingUsers > 0) {
      console.log(`⚠️  Warning: PostgreSQL already has ${existingUsers} users`);
      console.log('   This migration will skip users with duplicate emails.\n');
    }

    // Migrate users
    console.log('📦 Migrating users...\n');
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Try to insert with original ID first (if possible)
        // PostgreSQL SERIAL will auto-generate, so we'll let it handle IDs
        const result = await pool.query(
          `INSERT INTO users (email, password, created_at) 
           VALUES ($1, $2, $3) 
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [
            user.email,
            user.password,
            user.created_at || new Date().toISOString()
          ]
        );

        if (result.rows.length > 0) {
          migrated++;
          console.log(`  ✅ Migrated: ${user.email} (SQLite ID: ${user.id} → PostgreSQL ID: ${result.rows[0].id})`);
        } else {
          skipped++;
          console.log(`  ⏭️  Skipped: ${user.email} (already exists)`);
        }
      } catch (e) {
        errors++;
        console.error(`  ❌ Error migrating ${user.email}:`, e.message);
      }
    }

    console.log(`\n✨ Migration complete!`);
    console.log(`   ✅ Migrated: ${migrated} users`);
    console.log(`   ⏭️  Skipped: ${skipped} users`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors} users`);
    }

    // Verify migration
    const finalCount = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`\n📊 Total users in PostgreSQL: ${finalCount.rows[0].count}`);

  } catch (e) {
    console.error('❌ Migration error:', e);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

