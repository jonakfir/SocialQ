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
    sameSite: isProd ? 'none' : 'lax',   // 'none' for cross-origin in production
    secure:   isProd,                    // Required when sameSite is 'none'
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000
  });
  // Return token for client to store in localStorage (for cross-origin requests)
  return token;
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd, path: '/' });
  res.clearCookie(UID_COOKIE,     { httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd, path: '/' });
}

function uidFromCookiesOrJWT(req) {
  // First, try JWT from Authorization header (for cross-origin requests)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  console.log('[uidFromCookiesOrJWT] Authorization header present:', !!authHeader);
  if (authHeader) {
    console.log('[uidFromCookiesOrJWT] Header value (first 50 chars):', authHeader.substring(0, 50));
  }
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log('[uidFromCookiesOrJWT] Extracted token, length:', token.length);
      
      // Try to decode without verification first to see the payload
      try {
        const decoded = jwt.decode(token);
        console.log('[uidFromCookiesOrJWT] Decoded JWT (without verification):', JSON.stringify(decoded));
      } catch (decodeErr) {
        console.log('[uidFromCookiesOrJWT] Could not decode JWT:', decodeErr.message);
      }
      
      const payload = jwt.verify(token, JWT_SECRET);
      console.log('[uidFromCookiesOrJWT] ✅ JWT verified successfully, payload:', JSON.stringify(payload));
      const uid = Number(payload?.uid);
      if (uid) {
        console.log('[uidFromCookiesOrJWT] ✅ Found UID from Authorization header:', uid);
        return uid;
      } else {
        console.log('[uidFromCookiesOrJWT] ❌ No UID in JWT payload. Payload keys:', Object.keys(payload || {}));
      }
    } catch (err) {
      console.log('[uidFromCookiesOrJWT] ❌ JWT verification failed:', err.message);
      console.log('[uidFromCookiesOrJWT] JWT_SECRET present:', !!JWT_SECRET, 'Length:', JWT_SECRET ? JWT_SECRET.length : 0);
      if (err.name === 'JsonWebTokenError') {
        console.log('[uidFromCookiesOrJWT] Token format error - token may be corrupted');
      } else if (err.name === 'TokenExpiredError') {
        console.log('[uidFromCookiesOrJWT] Token expired');
      }
    }
  } else if (authHeader) {
    console.log('[uidFromCookiesOrJWT] ❌ Authorization header does not start with "Bearer ". Header:', authHeader.substring(0, 20));
  } else {
    console.log('[uidFromCookiesOrJWT] No Authorization header found. Available headers:', Object.keys(req.headers).filter(h => h.toLowerCase().includes('auth')));
  }

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

    // Sign them in immediately - get JWT token
    const token = setSessionCookies(res, user);

    return res.status(201).json({ ok: true, user: { ...user, role }, token });
  } catch (e) {
    console.error('[register] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('[login] Login attempt started');
    const email = normEmail(req.body?.email);
    const password = req.body?.password;
    console.log('[login] Email:', email, 'Password provided:', !!password);

    if (!email || !password) {
      console.log('[login] Missing email or password');
      return res.status(400).json({ error: 'Missing email or password' });
    }

    // HARDCODE: jonakfir@gmail.com - ALWAYS allow, create if needed
    if (email === 'jonakfir@gmail.com') {
      console.log('[login] ✅ ADMIN USER DETECTED: jonakfir@gmail.com - BYPASSING ALL CHECKS');
      
      // Try to get or create user, but don't fail if it doesn't work
      let userId = 1; // Default ID
      let userEmail = 'jonakfir@gmail.com';
      
      try {
        let user = await findUserByEmail(email);
        if (user) {
          userId = user.id;
          console.log('[login] Found existing admin user, ID:', userId);
        } else {
          console.log('[login] Admin user not found, creating...');
          try {
            const hashedPassword = await bcrypt.hash('admin123', 12);
            const newUser = await createUser({ email: 'jonakfir@gmail.com', password: hashedPassword });
            userId = newUser.id;
            console.log('[login] Admin user created, ID:', userId);
          } catch (createErr) {
            console.error('[login] Could not create user, using default ID:', createErr.message);
            // Use default ID and continue
          }
        }
      } catch (dbErr) {
        console.error('[login] Database error (non-critical):', dbErr.message);
        // Continue with default ID
      }
      
      // ALWAYS allow login for jonakfir@gmail.com regardless of password or database state
      console.log('[login] Setting session cookies for admin, ID:', userId);
      const token = setSessionCookies(res, { id: userId, email: userEmail });
      console.log('[login] ✅ ADMIN LOGIN SUCCESS - BYPASSED ALL CHECKS');
      return res.json({ ok: true, user: { id: userId, email: userEmail, role: 'admin' }, token });
    }

    // Regular login for other users
    console.log('[login] Regular user login attempt');
    const user = await findUserByEmail(email) || await findUserByUsername(email);
    if (!user) {
      console.log('[login] User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      console.log('[login] Password mismatch for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const role = 'personal';
    const token = setSessionCookies(res, { id: user.id, email: user.email });
    console.log('[login] ✅ Regular login successful');
    return res.json({ ok: true, user: { id: user.id, email: user.email, role }, token });
  } catch (e) {
    console.error('[login] FATAL ERROR:', e);
    console.error('[login] Error message:', e.message);
    console.error('[login] Error stack:', e.stack);
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
    // Log auth method for debugging
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie || '';
    const uidCookie = req.cookies?.[UID_COOKIE];
    const sessionCookie = req.cookies?.[SESSION_COOKIE];
    console.log('[me] Auth method:', authHeader ? 'Authorization header' : 'Cookies');
    console.log('[me] Cookie header present:', !!cookieHeader, 'Length:', cookieHeader.length);
    console.log('[me] UID cookie:', uidCookie ? `present (${uidCookie})` : 'missing');
    console.log('[me] Session cookie:', sessionCookie ? 'present' : 'missing');
    
    const uid = uidFromCookiesOrJWT(req);
    console.log('[me] Extracted UID:', uid);
    
    if (!uid) {
      console.log('[me] No UID found, returning null user');
      return res.json({ ok: true, user: null });
    }

    const user = await findUserById(uid);
    if (!user) {
      console.log('[me] User not found for UID:', uid);
      return res.json({ ok: true, user: null });
    }

    // Hardcode admin privileges for jonakfir@gmail.com
    const email = normEmail(user.email);
    const isAdmin = email === 'jonakfir@gmail.com';
    const role = isAdmin ? 'admin' : 'personal';

    console.log('[me] ✅ User found:', email, 'Role:', role);
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
