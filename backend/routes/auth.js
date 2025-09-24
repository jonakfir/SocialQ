// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  createUser,
  findUserByEmail,
  findUserByUsername,             // back-compat alias to email lookup
  findUserById,
  updateUserEmailAndOrPassword
} = require('../db/db');

const router = express.Router();

// ---------------- Config ----------------
const SESSION_COOKIE = 'session';                 // JWT cookie (httpOnly)
const UID_COOKIE     = 'uid';                     // simple numeric id for server-side routes
const JWT_SECRET     = process.env.AUTH_SECRET || 'dev-change-this';
const JWT_TTL        = '7d';                      // token lifetime
const isProd         = process.env.NODE_ENV === 'production';

// --------------- Helpers ----------------
function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}

function setSessionCookies(res, { id, email }) {
  const token = signToken({ uid: id, un: email });
  // JWT session (used by web, optional)
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',   // set to 'none' if you call API cross-site from web
    secure:   isProd,                    // Railway is HTTPS -> true in prod
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  // Simple uid (used by /auth/delete server route)
  res.cookie(UID_COOKIE, String(id), {
    httpOnly: true,
    sameSite: 'lax',
    secure:   isProd,
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd, path: '/' });
  res.clearCookie(UID_COOKIE,     { httpOnly: true, sameSite: 'lax',                 secure: isProd, path: '/' });
}

function uidFromCookiesOrJWT(req) {
  // Prefer explicit uid cookie (set on login/register)
  const fromUidCookie = Number(req.cookies?.[UID_COOKIE]);
  if (fromUidCookie) return fromUidCookie;

  // Fallback: parse JWT session cookie
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    return Number(payload?.uid) || null;
  } catch {
    return null;
  }
}

// tiny health
router.get('/_health', (_req, res) => res.json({ ok: true }));

// ----------------- Routes -----------------

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const password = req.body?.password;
    const email = normEmail(rawEmail);

    if (!email || !password || email.length < 3 || String(password).length < 6) {
      return res.status(400).json({ error: 'Email ≥ 3 chars, password ≥ 6 chars' });
    }

    const existing = findUserByEmail(email) || findUserByUsername(email);
    if (existing) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 12);
    const user = createUser({ email, password: hash });

    // Sign them in immediately
    setSessionCookies(res, user);

    return res.status(201).json({ ok: true, user });
  } catch (e) {
    console.error('[register] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const email = normEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const user = findUserByEmail(email) || findUserByUsername(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    setSessionCookies(res, { id: user.id, email: user.email });
    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('[login] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  try {
    clearSessionCookies(res);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[logout] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /auth/me
router.get('/me', (req, res) => {
  try {
    const uid = uidFromCookiesOrJWT(req);
    if (!uid) return res.json({ ok: true, user: null });

    const user = findUserById(uid);
    return res.json({ ok: true, user: user ? { id: user.id, email: user.email } : null });
  } catch (e) {
    console.error('[me] error', e);
    return res.json({ ok: true, user: null });
  }
});

// POST /auth/update
router.post('/update', async (req, res) => {
  try {
    const uid = uidFromCookiesOrJWT(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const rawEmail = req.body?.email;
    const email = rawEmail != null ? normEmail(rawEmail) : null;
    const password = req.body?.password;

    if ((email == null || email === '') && (password == null || password === '')) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    if (email) {
      // prevent duplicate email on another account
      const existing = findUserByEmail(email);
      if (existing && existing.id !== uid) {
        return res.status(409).json({ error: 'Email already taken' });
      }
    }

    let newPasswordHash = null;
    if (password && String(password).length > 0) {
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      newPasswordHash = await bcrypt.hash(password, 12);
    }

    updateUserEmailAndOrPassword(uid, {
      email: email ?? null,
      password: newPasswordHash ?? null
    });

    const updated = findUserById(uid);
    // refresh cookies in case email changed
    setSessionCookies(res, { id: updated.id, email: updated.email });

    return res.json({ ok: true, user: { id: updated.id, email: updated.email } });
  } catch (e) {
    console.error('[update] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
