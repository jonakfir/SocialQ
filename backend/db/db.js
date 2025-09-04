// backend/db/db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Writable dir (Railway)/local ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

// Pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create email-based table if missing
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);

// ---- Migrate old "username" → "email" if an older DB exists ----
try {
  const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
  if (cols.includes('username') && !cols.includes('email')) {
    // Try simple rename first (SQLite >= 3.25)
    try {
      db.exec(`ALTER TABLE users RENAME COLUMN username TO email;`);
    } catch {
      // Rebuild fallback
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
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

// ---- Helpers (email-centric) ----
function createUser({ email, password }) {
  const info = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, password);
  return { id: info.lastInsertRowid, email };
}

function findUserByEmail(email) {
  return db.prepare('SELECT id, email, password FROM users WHERE email = ?').get(email) || null;
}

// Backward-compat alias: treat "username" as email for callers that still use that name
const findUserByUsername = (email) => findUserByEmail(email);

function findUserById(id) {
  return db.prepare('SELECT id, email, password FROM users WHERE id = ?').get(id) || null;
}

module.exports = {
  db,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById
};
