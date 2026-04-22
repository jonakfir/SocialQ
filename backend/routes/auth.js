// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  createUser,
  findUserByEmail,
  findUserByUsername,             // back-compat alias to email lookup
  findUserById,
  updateUserEmailAndOrPassword,
  updateUserDarkMode,
  getUserRole,
  updateUserRole,
  updateUserAccessLevel,
  createUserProfile,
  findUserProfileByUserId,
  initializeSchema
} = require('../db/db');

const router = express.Router();

// ---------------- Schema readiness ----------------
//
// Login / register used to run `SELECT 1 FROM users LIMIT 1` on EVERY request
// before the real query, as a self-healing "auto-init the schema if missing"
// guard. That added a full DB round-trip per login — ~300ms over AWS RDS for
// a check that only needs to succeed once per process.
//
// Now we cache the result in a module-level flag. First request that needs
// the DB runs the check; if it succeeds or the emergency init succeeds, the
// flag flips to `true` and no subsequent request pays the cost.
let schemaReady = false;

async function ensureSchemaReady(routeLabel) {
  if (schemaReady) return { ok: true };
  const dbModule = require('../db/db');
  const { pool } = dbModule;
  if (!pool) { schemaReady = true; return { ok: true }; } // SQLite path is always ready

  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    schemaReady = true;
    return { ok: true };
  } catch (dbErr) {
    if (dbErr.message?.includes('does not exist') || dbErr.message?.includes('relation')) {
      console.error(`[${routeLabel}] Database table missing, attempting emergency initialization...`);
      console.error(`[${routeLabel}] Error was:`, dbErr.message);
      const initSchema = dbModule.initializeSchema;
      if (!initSchema || typeof initSchema !== 'function') {
        console.error(`[${routeLabel}] ❌ initializeSchema not available`);
        return { ok: false, status: 503, error: 'Database not ready', details: 'Database initialization failed. Please contact support.' };
      }
      try {
        await initSchema();
        console.log(`[${routeLabel}] ✅ Emergency schema initialization successful`);
        await pool.query('SELECT 1 FROM users LIMIT 1');
        schemaReady = true;
        return { ok: true };
      } catch (initErr) {
        console.error(`[${routeLabel}] ❌ Emergency schema initialization failed:`, initErr.message);
        return { ok: false, status: 503, error: 'Database not ready', details: 'Please try again in a moment' };
      }
    }
    throw dbErr;
  }
}

// ---------------- Config ----------------
const SESSION_COOKIE = 'session';                 // JWT cookie (httpOnly)
const UID_COOKIE     = 'uid';                     // simple numeric id for server-side routes
const JWT_SECRET     = process.env.AUTH_SECRET || 'dev-change-this';
const JWT_TTL        = '7d';                      // token lifetime
const isProd         = process.env.NODE_ENV === 'production';

// Server-to-server helper (node-fetch v3 is ESM)
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

// Optional: also create/update the user in the SvelteKit/Prisma "platform" DB
// (used by the web app) so mobile signups become real platform customers too.
const FRONTEND_URL = String(process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || '').trim().replace(/\/$/, '');
const PROXY_SECRET = String(process.env.PROXY_SECRET || process.env.BACKEND_PROXY_SECRET || '').trim();

async function syncPlatformUser({ email, password, backendUserId }) {
  if (!FRONTEND_URL) return null;
  // Use existing SvelteKit endpoint that creates/updates the Prisma user
  const url = `${FRONTEND_URL}/api/sync-user`;
  const headers = { 'Content-Type': 'application/json' };
  if (PROXY_SECRET) headers['X-Proxy-Secret'] = PROXY_SECRET;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, backendUserId, password })
  });

  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok || !data?.ok) {
    const msg = (data && (data.error || data.details)) || text || `HTTP ${res.status}`;
    throw new Error(`sync-user failed: ${msg}`);
  }
  return data.user || null;
}

// --------------- Helpers ----------------
/** Returns effective access level and trialEndsAt (ISO string or null). If free_trial is expired, updates user to none and returns none. */
async function getEffectiveAccessAndTrial(user) {
  let accessLevel = user.access_level || 'none';
  let trialEndsAt = null;
  if (user.trial_ends_at) {
    const end = new Date(user.trial_ends_at);
    if (!isNaN(end.getTime())) trialEndsAt = end.toISOString();
  }
  if (accessLevel === 'free_trial' && trialEndsAt) {
    const now = new Date();
    if (new Date(trialEndsAt).getTime() <= now.getTime()) {
      await updateUserAccessLevel(user.id, 'none', null);
      accessLevel = 'none';
      trialEndsAt = null;
    }
  }
  return { accessLevel, trialEndsAt };
}

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

// DEBUG endpoint to check headers
router.get('/_debug-headers', (req, res) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const allHeaders = Object.keys(req.headers);
  res.json({ 
    ok: true, 
    hasAuthHeader: !!authHeader,
    authHeaderPreview: authHeader ? authHeader.substring(0, 50) : null,
    allHeaders: allHeaders,
    authHeaders: allHeaders.filter(h => h.toLowerCase().includes('auth'))
  });
});

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

    const ready = await ensureSchemaReady('register');
    if (!ready.ok) return res.status(ready.status).json({ error: ready.error, details: ready.details });

    const existing = await findUserByEmail(email) || await findUserByUsername(email);
    if (existing) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 12);
    
    // Determine role - jonakfir@gmail.com is always admin
    const role = email === 'jonakfir@gmail.com' ? 'admin' : 'personal';
    // Daily free play (just_try) → access_level 'none'; pro/trial come via services/signup
    const profile = req.body?.profile;
    const goal = profile?.goal;
    const accessLevel = goal === 'just_try' ? 'none' : 'none';
    
    const user = await createUser({ email, password: hash, role, accessLevel });

    // Store onboarding profile data tied to this user (age, verbal, literate, goals - for reminders)
    if (profile && typeof profile === 'object') {
      try {
        const userType = (profile.user_type || 'myself').replace(/-/g, '_').toLowerCase();
        const validTypes = ['myself', 'my_child', 'my_student', 'someone_else'];
        const safeUserType = validTypes.includes(userType) ? userType : 'myself';
        await createUserProfile(user.id, {
          user_type: safeUserType,
          beneficiary_name: profile.beneficiary_name || null,
          is_over_18: profile.is_over_18,
          birthday: profile.birthday || null,
          is_verbal: profile.is_verbal,
          is_literate: profile.is_literate,
          goal: profile.goal || null,
          teacher_email: profile.teacher_email || null,
          doctor_email: profile.doctor_email || null,
          doctor_name: profile.doctor_name || null,
          parent_name: profile.parent_name || null,
          parent_email: profile.parent_email || null
        });
      } catch (profileErr) {
        console.error('[register] Profile save failed (non-fatal):', profileErr.message);
      }
    }

    // Sign them in immediately - get JWT token
    const token = setSessionCookies(res, user);

    // Notify admin of new signup with full flow details.
    // Default: fire-and-forget (doesn't block registration).
    // Debug: pass ?waitEmail=1 to await SMTP and return emailStatus.
    const { notifyNewSignup } = require('../lib/notifyNewSignup');
    const waitEmail =
      String(req.query?.waitEmail || '').toLowerCase() === '1' ||
      String(req.query?.waitEmail || '').toLowerCase() === 'true';
    let emailStatus = undefined;
    if (waitEmail) {
      try {
        await notifyNewSignup(user, profile);
        emailStatus = { ok: true };
      } catch (err) {
        emailStatus = { ok: false, error: err?.message || String(err) };
      }
    } else {
      notifyNewSignup(user, profile).catch((err) =>
        console.error('[register] notify signup email failed:', err?.message || err)
      );
    }

    // Also sync to platform (Prisma) so mobile signups exist in the web app DB too.
    // Fire-and-forget by default; add ?waitSync=1 for debugging.
    const waitSync = String(req.query?.waitSync || '').toLowerCase() === '1' || String(req.query?.waitSync || '').toLowerCase() === 'true';
    const syncPromise = syncPlatformUser({ email, password, backendUserId: user.id })
      .then((platformUser) => {
        console.log('[register] ✅ platform sync ok for', email, 'platformUserId:', platformUser?.id || '—');
        return platformUser;
      })
      .catch((err) => {
        console.warn('[register] platform sync failed for', email, '-', err?.message || err);
        return null;
      });

    const platformUser = waitSync ? await syncPromise : undefined;

    return res.status(201).json({
      ok: true,
      user: { ...user, role: user.role, accessLevel: user.access_level || 'none', trialEndsAt: null },
      token,
      ...(emailStatus !== undefined ? { emailStatus } : {}),
      ...(platformUser !== undefined ? { platformUser } : {})
    });
  } catch (e) {
    console.error('[register] error', e);
    console.error('[register] error details:', e.message);
    console.error('[register] error code:', e.code);
    console.error('[register] error stack:', e.stack);
    
    // Handle specific database errors
    if (e.code === '23505' || e.message?.includes('UNIQUE') || e.message?.includes('duplicate')) {
      return res.status(409).json({ error: 'Email already used' });
    }
    
    if (e.message?.includes('does not exist') || e.message?.includes('relation')) {
      return res.status(503).json({ 
        error: 'Database not ready', 
        details: 'Please try again in a moment' 
      });
    }
    
    return res.status(500).json({ error: 'Server error', details: e.message });
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

    const ready = await ensureSchemaReady('login');
    if (!ready.ok) return res.status(ready.status).json({ error: ready.error, details: ready.details });

    // Regular login. `findUserByUsername` in db.js is literally an alias for
    // `findUserByEmail` (kept for back-compat) — calling both doubled the DB
    // cost for bad-credential attempts with no behavioral benefit.
    console.log('[login] Login attempt for:', email);
    const user = await findUserByEmail(email);

    if (!user) {
      console.log('[login] User not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      console.log('[login] Password mismatch for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const role = user.role || 'personal';

    const token = setSessionCookies(res, { id: user.id, email: user.email });
    const { accessLevel, trialEndsAt } = await getEffectiveAccessAndTrial(user);
    console.log('[login] ✅ Regular login successful, role:', role, 'accessLevel:', accessLevel, 'user.id:', user.id);
    return res.json({ ok: true, user: { id: user.id, email: user.email, role, accessLevel, trialEndsAt }, token });
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
    // Log ALL headers for debugging (in production, only log auth-related)
    const allHeaders = Object.keys(req.headers);
    const authHeaders = allHeaders.filter(h => h.toLowerCase().includes('auth'));
    console.log('[me] Request received - Auth-related headers:', authHeaders.join(', '));
    
    // Log auth method for debugging
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const cookieHeader = req.headers.cookie || '';
    const uidCookie = req.cookies?.[UID_COOKIE];
    const sessionCookie = req.cookies?.[SESSION_COOKIE];
    console.log('[me] Auth method:', authHeader ? 'Authorization header' : 'Cookies');
    console.log('[me] Authorization header present:', !!authHeader);
    if (authHeader) {
      console.log('[me] Authorization header value (first 50 chars):', authHeader.substring(0, 50));
    }
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

    // Get role from database (ensure jonakfir@gmail.com is admin)
    const email = normEmail(user.email);
    let role = user.role || 'personal';
    
    // Ensure jonakfir@gmail.com always has admin role
    if (email === 'jonakfir@gmail.com' && role !== 'admin') {
      await updateUserRole(user.id, 'admin');
      role = 'admin';
    }

    // Fetch profile (age, verbal, literate, goals - tied to user for reminders)
    let profile = null;
    try {
      profile = await findUserProfileByUserId(uid);
    } catch (e) {
      console.warn('[me] Profile fetch failed:', e.message);
    }

    const { accessLevel, trialEndsAt } = await getEffectiveAccessAndTrial(user);
    console.log('[me] ✅ User found:', email, 'Role:', role, 'AccessLevel:', accessLevel);
    return res.json({ 
      ok: true, 
      user: { 
        id: user.id, 
        email: user.email, 
        role,
        accessLevel,
        trialEndsAt,
        darkMode: user.dark_mode ?? false,
        profile: profile ? {
          userType: profile.user_type,
          beneficiaryName: profile.beneficiary_name,
          isOver18: profile.is_over_18,
          birthday: profile.birthday,
          isVerbal: profile.is_verbal,
          isLiterate: profile.is_literate,
          goal: profile.goal
        } : null
      } 
    });
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
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updatedEmail = normEmail(updated.email);
    let role = updated.role || 'personal';
    
    // Ensure jonakfir@gmail.com always has admin role
    if (updatedEmail === 'jonakfir@gmail.com' && role !== 'admin') {
      await updateUserRole(updated.id, 'admin');
      role = 'admin';
    }

    // refresh cookies in case email changed
    setSessionCookies(res, { id: updated.id, email: updated.email });

    const { accessLevel, trialEndsAt } = await getEffectiveAccessAndTrial(updated);
    return res.json({ 
      ok: true, 
      user: { 
        id: updated.id, 
        email: updated.email, 
        role,
        accessLevel,
        trialEndsAt,
        darkMode: updated.dark_mode ?? false
      } 
    });
  } catch (e) {
    console.error('[update] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/profile - Update or create user profile (onboarding data tied to user)
router.post('/profile', async (req, res) => {
  try {
    const uid = uidFromCookiesOrJWT(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const profile = req.body?.profile || req.body;
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ error: 'Profile data required' });
    }

    const userType = (profile.user_type || profile.userType || 'myself').replace(/-/g, '_').toLowerCase();
    const validTypes = ['myself', 'my_child', 'my_student', 'someone_else'];
    const safeUserType = validTypes.includes(userType) ? userType : 'myself';

    await createUserProfile(uid, {
      user_type: safeUserType,
      beneficiary_name: profile.beneficiary_name || profile.beneficiaryName || null,
      is_over_18: profile.is_over_18 ?? profile.isOver18,
      birthday: profile.birthday || null,
      is_verbal: profile.is_verbal ?? profile.isVerbal,
      is_literate: profile.is_literate ?? profile.isLiterate,
      goal: profile.goal || null,
      teacher_email: profile.teacher_email || profile.teacherEmail || null,
      doctor_email: profile.doctor_email || profile.doctorEmail || null,
      doctor_name: profile.doctor_name || profile.doctorName || null,
      parent_name: profile.parent_name || profile.parentName || null,
      parent_email: profile.parent_email || profile.parentEmail || null
    });

    const updated = await findUserProfileByUserId(uid);
    return res.json({ ok: true, profile: updated });
  } catch (e) {
    console.error('[profile] error', e);
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
});

// POST /auth/preferences
router.post('/preferences', async (req, res) => {
  try {
    const uid = uidFromCookiesOrJWT(req);
    if (!uid) return res.status(401).json({ error: 'Not authenticated' });

    const darkMode = req.body?.darkMode;
    if (typeof darkMode !== 'boolean') {
      return res.status(400).json({ error: 'darkMode must be a boolean' });
    }

    await updateUserDarkMode(uid, darkMode);

    const updated = await findUserById(uid);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updatedEmail = normEmail(updated.email);
    let role = updated.role || 'personal';
    
    // Ensure jonakfir@gmail.com always has admin role
    if (updatedEmail === 'jonakfir@gmail.com' && role !== 'admin') {
      await updateUserRole(updated.id, 'admin');
      role = 'admin';
    }

    const { accessLevel, trialEndsAt } = await getEffectiveAccessAndTrial(updated);
    return res.json({ 
      ok: true, 
      user: { 
        id: updated.id, 
        email: updated.email, 
        role,
        accessLevel,
        trialEndsAt,
        darkMode: updated.dark_mode ?? false
      } 
    });
  } catch (e) {
    console.error('[preferences] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
