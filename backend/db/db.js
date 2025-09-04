// backend/db/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Put DB in /app/data in prod (writable) or local ./data during dev
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

// schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
`);

// helpers
function createUser({ username, password }) {
  const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  const info = stmt.run(username, password);
  return { id: info.lastInsertRowid, username };
}

function findUserByUsername(username) {
  return db.prepare('SELECT id, username, password FROM users WHERE username = ?').get(username) || null;
}

function findUserById(id) {
  return db.prepare('SELECT id, username, password FROM users WHERE id = ?').get(id) || null;
}

module.exports = { db, createUser, findUserByUsername, findUserById };
