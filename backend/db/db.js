// backend/db/db.js
const { Pool } = require('pg');

// -------------------------
// Database Connection
// -------------------------
// Use DATABASE_URL if available (Railway provides this), otherwise fall back to SQLite
const DATABASE_URL = process.env.DATABASE_URL;

let db = null;
let pool = null;
let usePostgres = false;

if (DATABASE_URL && DATABASE_URL.startsWith('postgresql://')) {
  // Use PostgreSQL
  usePostgres = true;
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  console.log('[DB] Using PostgreSQL');
  
  // Test connection
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('[DB] PostgreSQL connection error:', err);
    } else {
      console.log('[DB] PostgreSQL connected successfully');
    }
  });
} else {
  // Fall back to SQLite for local development
  const fs = require('fs');
  const path = require('path');
  const Database = require('better-sqlite3');
  
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  
  const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
  db = new Database(DB_PATH, { fileMustExist: false });
  
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 4000');
  
  console.log('[DB] Using SQLite (local development)');
}

// -------------------------
// Schema Setup
// -------------------------
async function initializeSchema() {
  if (usePostgres) {
    try {
      console.log('[DB] Starting schema initialization...');
      // PostgreSQL schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id         SERIAL PRIMARY KEY,
          email      TEXT UNIQUE NOT NULL,
          password   TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[DB] Users table created/verified');
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);
      console.log('[DB] Email index created/verified');
      
      // Migration: username -> email (if needed)
      try {
        const result = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'username'
        `);
        
        if (result.rows.length > 0) {
          // Check if email column exists
          const emailCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'email'
          `);
          
          if (emailCheck.rows.length === 0) {
            // Migrate username to email
            await pool.query(`ALTER TABLE users RENAME COLUMN username TO email;`);
          }
        }
      } catch (e) {
        console.error('[DB migration failed]', e);
      }
      console.log('[DB] ✅ Schema initialization complete');
    } catch (err) {
      console.error('[DB] ❌ Schema initialization failed:', err);
      throw err;
    }
  } else {
    // SQLite schema (for local dev)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        email      TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    
    // Migration: username -> email
    try {
      const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
      if (cols.includes('username') && !cols.includes('email')) {
        try {
          db.exec(`ALTER TABLE users RENAME COLUMN username TO email;`);
        } catch {
          db.exec('BEGIN');
          db.exec(`
            CREATE TABLE users_new (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              email      TEXT UNIQUE NOT NULL,
              password   TEXT NOT NULL,
              created_at TEXT
            );
          `);
          db.exec(`
            INSERT INTO users_new (id, email, password, created_at)
            SELECT id, username, password, created_at FROM users;
          `);
          db.exec(`DROP TABLE users;`);
          db.exec(`ALTER TABLE users_new RENAME TO users;`);
          db.exec('COMMIT');
        }
      }
    } catch (e) {
      console.error('[DB migration failed]', e);
    }
  }
}

// Initialize schema on load - but export a promise so server can wait
const schemaInitPromise = initializeSchema()
  .then(() => {
    console.log('[DB] ✅ Schema initialization completed successfully');
    return true;
  })
  .catch(err => {
    console.error('[DB] ❌ Schema initialization error:', err);
    console.error('[DB] Error details:', err.message);
    throw err;
  });

// -------------------------
// Helpers (email-centric)
// -------------------------
function toEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

async function createUser({ email, password }) {
  const e = toEmailKey(email);
  
  if (usePostgres) {
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [e, password]
    );
    return { id: Number(result.rows[0].id), email: result.rows[0].email };
  } else {
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const info = stmt.run(e, password);
    return { id: Number(info.lastInsertRowid), email: e };
  }
}

async function findUserByEmail(email) {
  const e = toEmailKey(email);
  
  if (usePostgres) {
    const result = await pool.query(
      'SELECT id, email, password FROM users WHERE email = $1',
      [e]
    );
    return result.rows[0] || null;
  } else {
    return db
      .prepare('SELECT id, email, password FROM users WHERE email = ?')
      .get(e) || null;
  }
}

// Back-compat: treat "username" as email
const findUserByUsername = (email) => findUserByEmail(email);

async function findUserById(id) {
  if (usePostgres) {
    const result = await pool.query(
      'SELECT id, email, password FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } else {
    return db
      .prepare('SELECT id, email, password FROM users WHERE id = ?')
      .get(id) || null;
  }
}

async function deleteUserById(id) {
  if (usePostgres) {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return { changes: result.rowCount };
  } else {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
}

async function updateUserEmailAndOrPassword(id, { email, password }) {
  const patches = [];
  const args = [];
  let paramIndex = 1;
  
  if (email != null) {
    patches.push(`email = $${paramIndex++}`);
    args.push(toEmailKey(email));
  }
  if (password != null) {
    patches.push(`password = $${paramIndex++}`);
    args.push(password);
  }
  
  if (patches.length === 0) return { changes: 0 };
  
  args.push(id);
  
  if (usePostgres) {
    const sql = `UPDATE users SET ${patches.join(', ')} WHERE id = $${paramIndex}`;
    const result = await pool.query(sql, args);
    return { changes: result.rowCount };
  } else {
    const patchesSql = [];
    const argsSql = [];
    if (email != null) { patchesSql.push('email = ?'); argsSql.push(toEmailKey(email)); }
    if (password != null) { patchesSql.push('password = ?'); argsSql.push(password); }
    argsSql.push(id);
    const sql = `UPDATE users SET ${patchesSql.join(', ')} WHERE id = ?`;
    return db.prepare(sql).run(...argsSql);
  }
}

async function countUsers() {
  if (usePostgres) {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(result.rows[0].count, 10);
  } else {
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return result.count || 0;
  }
}

module.exports = {
  db: usePostgres ? pool : db,
  pool: usePostgres ? pool : null,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  deleteUserById,
  updateUserEmailAndOrPassword,
  countUsers,
  schemaInitPromise // Export so server can wait for it
};
