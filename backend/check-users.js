// Script to check users in PostgreSQL database
require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  console.log('💡 Make sure your .env file contains: DATABASE_URL=postgresql://...');
  process.exit(1);
}

if (!DATABASE_URL.startsWith('postgresql://')) {
  console.error('❌ DATABASE_URL does not start with postgresql://');
  console.log('Current value:', DATABASE_URL.substring(0, 20) + '...');
  process.exit(1);
}

console.log('🔌 Connecting to PostgreSQL...');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT id, email, role, created_at FROM users ORDER BY id')
  .then(result => {
    console.log('\n✅ Found', result.rows.length, 'users in database:\n');
    if (result.rows.length === 0) {
      console.log('  No users found in database.');
    } else {
      result.rows.forEach((user, i) => {
        console.log(`  ${i+1}. ID: ${user.id}`);
        console.log(`     Email: ${user.email}`);
        console.log(`     Role: ${user.role || 'N/A'}`);
        console.log(`     Created: ${user.created_at}`);
        console.log('');
      });
    }
    pool.end();
  })
  .catch(err => {
    console.error('❌ Error querying database:', err.message);
    if (err.message.includes('does not exist')) {
      console.log('💡 The users table might not exist yet. The backend will create it on startup.');
    }
    pool.end();
    process.exit(1);
  });
