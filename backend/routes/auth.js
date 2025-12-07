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

    const existing = await findUserByEmail(email) || await findUserByUsername(email);
    if (existing) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 12);
    const user = await createUser({ email, password: hash });

    // Hardcode admin privileges for jonakfir@gmail.com
    const isAdmin = email === 'jonakfir@gmail.com';
    const role = isAdmin ? 'admin' : 'personal';

    // Sign them in immediately
    setSessionCookies(res, user);

    return res.status(201).json({ ok: true, user: { ...user, role } });
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

    // HARDCODE: Auto-create jonakfir@gmail.com with admin privileges if it doesn't exist
    // For this user, accept ANY password and always log them in as admin
    if (email === 'jonakfir@gmail.com') {
      let user = await findUserByEmail(email) || await findUserByUsername(email);
      
      if (!user) {
        // Create the admin user automatically with password admin123
        console.log('[login] Auto-creating admin user: jonakfir@gmail.com');
        try {
          const hashedPassword = await bcrypt.hash('admin123', 12);
          const newUser = await createUser({ email: 'jonakfir@gmail.com', password: hashedPassword });
          console.log('[login] Admin user created:', newUser.id);
          // Fetch the user again to get full user object
          user = await findUserByEmail(email);
        } catch (createErr) {
          console.error('[login] Error creating admin user:', createErr);
          // If creation fails, try to find user again (might have been created by another request)
          user = await findUserByEmail(email);
        }
      }
      
      if (!user) {
        console.error('[login] Failed to create/find admin user after retry');
        return res.status(500).json({ error: 'Failed to create admin user', details: 'Please try again' });
      }
      
      // For jonakfir@gmail.com, accept ANY password - always allow login
      // Update password to admin123 if it doesn't match (for consistency)
      try {
        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
          console.log('[login] Password mismatch for admin, updating to admin123');
          const hashedPassword = await bcrypt.hash('admin123', 12);
          await updateUserEmailAndOrPassword(user.id, { password: hashedPassword });
        }
      } catch (pwdErr) {
        console.error('[login] Password check/update error:', pwdErr);
        // Continue anyway - we'll allow login regardless
      }
      
      setSessionCookies(res, { id: user.id, email: user.email });
      return res.json({ ok: true, user: { id: user.id, email: user.email, role: 'admin' } });
    }

    // Regular login for other users
    const user = await findUserByEmail(email) || await findUserByUsername(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const role = 'personal';
    setSessionCookies(res, { id: user.id, email: user.email });
    return res.json({ ok: true, user: { id: user.id, email: user.email, role } });
  } catch (e) {
    console.error('[login] error', e);
    console.error('[login] error details:', e.message, e.stack);
    return res.status(500).json({ error: 'Server error', details: e.message });
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
router.get('/me', async (req, res) => {
  try {
    const uid = uidFromCookiesOrJWT(req);
    if (!uid) return res.json({ ok: true, user: null });

    const user = await findUserById(uid);
    if (!user) return res.json({ ok: true, user: null });

    // Hardcode admin privileges for jonakfir@gmail.com
    const email = normEmail(user.email);
    const isAdmin = email === 'jonakfir@gmail.com';
    const role = isAdmin ? 'admin' : 'personal';

    return res.json({ ok: true, user: { id: user.id, email: user.email, role } });
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
      const existing = await findUserByEmail(email);
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

    await updateUserEmailAndOrPassword(uid, {
      email: email ?? null,
      password: newPasswordHash ?? null
    });

    const updated = await findUserById(uid);
    const updatedEmail = normEmail(updated.email);
    const isAdmin = updatedEmail === 'jonakfir@gmail.com';
    const role = isAdmin ? 'admin' : 'personal';

    // refresh cookies in case email changed
    setSessionCookies(res, { id: updated.id, email: updated.email });

    return res.json({ ok: true, user: { id: updated.id, email: updated.email, role } });
  } catch (e) {
    console.error('[update] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
