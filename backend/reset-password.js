// Script to reset password in backend database
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');

const db = new Database(DB_PATH);

async function resetPassword() {
  try {
    const email = 'jonakfir@gmail.com';
    const newPassword = 'admin123';
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Check if user exists
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());
    
    if (!user) {
      console.log(`❌ User ${email} not found in backend database.`);
      console.log('   Creating user...');
      
      // Create user
      const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
      const info = stmt.run(email.toLowerCase(), hashedPassword);
      const newUserId = info.lastInsertRowid;
      
      console.log(`✅ Created user:`);
      console.log(`   Email: ${email}`);
      console.log(`   Backend User ID: ${newUserId}`);
      console.log(`   Password: ${newPassword}`);
    } else {
      // Update password
      db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email.toLowerCase());
      
      console.log(`✅ Password reset successfully:`);
      console.log(`   Email: ${email}`);
      console.log(`   Backend User ID: ${user.id}`);
      console.log(`   New Password: ${newPassword}`);
    }
    
    console.log('\n💡 You can now log in with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

resetPassword();

