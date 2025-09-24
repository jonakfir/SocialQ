// backend/db/db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// -------------------------
// Filesystem & DB bootstrap
// -------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH, { fileMustExist: false });

// Pragmas / tunables
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 4000'); // avoid SQLITE_BUSY in concurrent envs

// -------------------------
// Schema
// -------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);

// Helpful index (UNIQUE already exists, this is just for lookups if needed)
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

// -------------------------
// Migration: username -> email
// -------------------------
try {
  const cols = db.prepare(`PRAGMA table_info(users);`).all().map(c => c.name);
  if (cols.includes('username') && !cols.includes('email')) {
    // Try simple rename (SQLite >= 3.25)
    try {
      db.exec(`ALTER TABLE users RENAME COLUMN username TO email;`);
    } catch {
      // Rebuild fallback if ALTER fails
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

// -------------------------
// Helpers (email-centric)
// -------------------------
function toEmailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function createUser({ email, password }) {
  const e = toEmailKey(email);
  const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
  const info = stmt.run(e, password);
  return { id: Number(info.lastInsertRowid), email: e };
}

function findUserByEmail(email) {
  const e = toEmailKey(email);
  return db
    .prepare('SELECT id, email, password FROM users WHERE email = ?')
    .get(e) || null;
}

// Back-compat: treat "username" as email
const findUserByUsername = (email) => findUserByEmail(email);

function findUserById(id) {
  return db
    .prepare('SELECT id, email, password FROM users WHERE id = ?')
    .get(id) || null;
}

function deleteUserById(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function updateUserEmailAndOrPassword(id, { email, password }) {
  const patches = [];
  const args = [];
  if (email != null) { patches.push('email = ?'); args.push(toEmailKey(email)); }
  if (password != null) { patches.push('password = ?'); args.push(password); }
  if (patches.length === 0) return { changes: 0 };
  args.push(id);
  const sql = `UPDATE users SET ${patches.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...args);
}

module.exports = {
  db,
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  deleteUserById,
  updateUserEmailAndOrPassword
};
