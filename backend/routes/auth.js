// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, createUser, findUserByUsername, findUserById } = require('../db/db');

const router = express.Router();

const COOKIE_NAME = 'session';
const JWT_SECRET  = process.env.AUTH_SECRET || 'dev-change-this';

// ---------------- helpers ----------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Only sets the cookie. DOES NOT send a response.
 * Handlers should call res.json(...) after this.
 */
function setSessionCookie(res, payload) {
  const token = signToken(payload);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax', // 'lax' locally, 'none' in prod
    secure:   isProd,                  // only true in prod (https)
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7    // 7 days
  });
}

function getUserIdFromCookie(req) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    return payload?.uid || null;
  } catch {
    return null;
  }
}

// --- tiny health route to confirm the router is mounted ---
router.get('/_health', (req, res) => {
  res.json({ ok: true });
});

// ---------------- routes -----------------

// POST /auth/register
router.post('/register', async (req, res) => {
  console.log('POST /auth/register');
  try {
    const { username, password } = req.body || {};
    if (!username || !password || String(username).length < 3 || String(password).length < 6) {
      return res.status(400).json({ error: 'Username ≥ 3 chars, password ≥ 6 chars' });
    }

    const exists = findUserByUsername(username);
    if (exists) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const user = createUser({ username, password: hash }); // { id, username }

    setSessionCookie(res, { uid: user.id, un: user.username });
    return res.json({ ok: true, user });
  } catch (e) {
    console.error('register error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  console.log('POST /auth/login');
  try {
    // Use USERNAME + PASSWORD (your DB helpers are username-based)
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    setSessionCookie(res, { uid: user.id, un: user.username });
    return res.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  console.log('POST /auth/logout');
  try {
    const isProd = process.env.NODE_ENV === 'production';
    // Properly clear the cookie (must match sameSite/secure/path)
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure:   isProd,
      path: '/'
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /auth/me
router.get('/me', (req, res) => {
  try {
    const uid = getUserIdFromCookie(req);
    if (!uid) return res.json({ user: null });
    const user = findUserById(uid); // { id, username, password }
    return res.json({ user: user ? { id: user.id, username: user.username } : null });
  } catch (e) {
    console.error('me error', e);
    return res.json({ user: null });
  }
});

// POST /auth/update   (update username and/or password)
router.post('/update', async (req, res) => {
  console.log('POST /auth/update');
  try {
    const uid = getUserIdFromCookie(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    let { username, password } = req.body || {};
    if (!username || String(username).length < 3) {
      return res.status(400).json({ error: 'Username ≥ 3 chars' });
    }

    // If username is changing, ensure it's not taken by someone else
    const existing = findUserByUsername(username);
    if (existing && existing.id !== uid) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    if (password && String(password).length) {
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?').run(username, hash, uid);
    } else {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, uid);
    }

    // refresh cookie with possibly new username
    setSessionCookie(res, { uid, un: username });
    return res.json({ ok: true, user: { id: uid, username } });
  } catch (e) {
    console.error('update error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
