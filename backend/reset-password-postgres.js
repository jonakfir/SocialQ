// Script to reset password in PostgreSQL database
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:sdIvNQPCTwNxYBsLBukdmrlbuifuZoAT@ballast.proxy.rlwy.net:25477/railway';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetPassword() {
  try {
    const email = process.argv[2] || 'jonakfir@gmail.com';
    const newPassword = process.argv[3] || 'admin123';
    
    console.log(`🔐 Resetting password for: ${email}`);
    console.log(`   New password: ${newPassword}\n`);
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Check if user exists
    const userResult = await pool.query('SELECT id, email, role FROM users WHERE email = $1', [email.toLowerCase()]);
    
    if (userResult.rows.length === 0) {
      console.log(`❌ User ${email} not found in database.`);
      console.log('   Creating user...');
      
      // Create user
      const createResult = await pool.query(
        'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [email.toLowerCase(), hashedPassword, email.toLowerCase() === 'jonakfir@gmail.com' ? 'admin' : 'personal']
      );
      const newUser = createResult.rows[0];
      
      console.log(`✅ Created user:`);
      console.log(`   ID: ${newUser.id}`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Role: ${newUser.role}`);
      console.log(`   Password: ${newPassword}`);
    } else {
      // Update password
      const user = userResult.rows[0];
      await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email.toLowerCase()]);
      
      console.log(`✅ Password reset successfully:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   New Password: ${newPassword}`);
    }
    
    console.log('\n💡 You can now log in with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

resetPassword();
