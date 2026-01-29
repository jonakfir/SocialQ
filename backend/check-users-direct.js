// Script to check users in PostgreSQL database - direct connection
const { Pool } = require('pg');

// Use the DATABASE_PUBLIC_URL from Railway
const DATABASE_URL = 'postgresql://postgres:sdIvNQPCTwNxYBsLBukdmrlbuifuZoAT@ballast.proxy.rlwy.net:25477/railway';

console.log('🔌 Connecting to PostgreSQL...');
console.log('Host: ballast.proxy.rlwy.net:25477');
console.log('Database: railway\n');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT id, email, role, created_at FROM users ORDER BY id')
  .then(result => {
    console.log('✅ Found', result.rows.length, 'users in database:\n');
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
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error querying database:', err.message);
    if (err.message.includes('does not exist')) {
      console.log('💡 The users table might not exist yet. The backend will create it on startup.');
    } else if (err.message.includes('password authentication failed')) {
      console.log('💡 Password might be incorrect. Check your Railway DATABASE_URL.');
    } else if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED')) {
      console.log('💡 Cannot connect to database. Check your network connection and Railway service status.');
    }
    pool.end();
    process.exit(1);
  });
