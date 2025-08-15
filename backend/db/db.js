// backend/db/db.js
const path = require('path');
const Database = require('better-sqlite3');

// DB file is at repo root: socialq.db
const dbPath = path.resolve(__dirname, '../../socialq.db');
const db = new Database(dbPath);

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const cuid = () =>
  'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);

function createUser({ username, password }) {
  const id = cuid();
  const stmt = db.prepare(`INSERT INTO users (id, username, password) VALUES (?, ?, ?)`);
  stmt.run(id, username, password);
  return { id, username };
}

function findUserByUsername(username) {
  const stmt = db.prepare(`SELECT * FROM users WHERE username = ?`);
  return stmt.get(username);
}

function findUserById(id) {
  const stmt = db.prepare(`SELECT id, username FROM users WHERE id = ?`);
  return stmt.get(id);
}

module.exports = { db, createUser, findUserByUsername, findUserById };
