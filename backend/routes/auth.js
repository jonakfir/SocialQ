// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, createUser, findUserByUsername, findUserById } = require('../db/db');

const router = express.Router();

const COOKIE_NAME = 'session';
const JWT_SECRET  = process.env.AUTH_SECRET || 'dev-change-this';

// ---- helpers ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function setSessionCookie(res, payload) {
  const token = signToken(payload);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure:   isProd,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7
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

// tiny health
router.get('/_health', (_req, res) => res.json({ ok: true }));

// ---- routes ----

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    // Keep the message aligned with your UI text
    if (!email || !password || String(email).length < 3 || String(password).length < 6) {
      return res.status(400).json({ error: 'Email ≥ 3 chars, password ≥ 6 chars' });
    }

    const existing = findUserByUsername(email); // alias to email lookup
    if (existing) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 12);
    const user = createUser({ email, password: hash });

    setSessionCookie(res, { uid: user.id, un: user.email });
    return res.json({ ok: true, user });
  } catch (e) {
    console.error('register error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const user = findUserByUsername(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    setSessionCookie(res, { uid: user.id, un: user.email });
    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
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
    const user = findUserById(uid);
    return res.json({ user: user ? { id: user.id, email: user.email } : null });
  } catch (e) {
    console.error('me error', e);
    return res.json({ user: null });
  }
});

// POST /auth/update
router.post('/update', async (req, res) => {
  try {
    const uid = getUserIdFromCookie(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const { email, password } = req.body || {};
    if (!email || String(email).length < 3) {
      return res.status(400).json({ error: 'email ≥ 3 chars' });
    }

    const existing = findUserByUsername(email);
    if (existing && existing.id !== uid) {
      return res.status(409).json({ error: 'email already taken' });
    }

    if (password && String(password).length) {
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE users SET email = ?, password = ? WHERE id = ?').run(email, hash, uid);
    } else {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, uid);
    }

    setSessionCookie(res, { uid, un: email });
    return res.json({ ok: true, user: { id: uid, email } });
  } catch (e) {
    console.error('update error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
