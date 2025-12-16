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
  getUserRole,
  updateUserRole,
  initializeSchema
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

    // Check if database is ready (users table exists)
    const dbModule = require('../db/db');
    const { pool } = dbModule;
    if (pool) {
      try {
        await pool.query('SELECT 1 FROM users LIMIT 1');
      } catch (dbErr) {
        if (dbErr.message?.includes('does not exist') || dbErr.message?.includes('relation')) {
          console.error('[register] Database table missing, attempting emergency initialization...');
          console.error('[register] Error was:', dbErr.message);
          
          // Get initializeSchema function
          const initSchema = dbModule.initializeSchema;
          if (!initSchema || typeof initSchema !== 'function') {
            console.error('[register] ❌ initializeSchema not available');
            return res.status(503).json({ 
              error: 'Database not ready', 
              details: 'Database initialization failed. Please contact support.' 
            });
          }
          
          try {
            await initSchema();
            console.log('[register] ✅ Emergency schema initialization successful');
            // Verify it worked
            await pool.query('SELECT 1 FROM users LIMIT 1');
          } catch (initErr) {
            console.error('[register] ❌ Emergency schema initialization failed:', initErr.message);
            console.error('[register] Init error stack:', initErr.stack);
            return res.status(503).json({ 
              error: 'Database not ready', 
              details: 'Please try again in a moment' 
            });
          }
        } else {
          throw dbErr;
        }
      }
    }

    const existing = await findUserByEmail(email) || await findUserByUsername(email);
    if (existing) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 12);
    
    // Determine role - jonakfir@gmail.com is always admin
    const role = email === 'jonakfir@gmail.com' ? 'admin' : 'personal';
    
    const user = await createUser({ email, password: hash, role });

    // Sign them in immediately - get JWT token
    const token = setSessionCookies(res, user);

    return res.status(201).json({ ok: true, user: { ...user, role: user.role }, token });
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

    // Check if database is ready (users table exists)
    const dbModule = require('../db/db');
    const { pool } = dbModule;
    if (pool) {
      try {
        await pool.query('SELECT 1 FROM users LIMIT 1');
      } catch (dbErr) {
        if (dbErr.message?.includes('does not exist') || dbErr.message?.includes('relation')) {
          console.error('[login] Database table missing, attempting emergency initialization...');
          console.error('[login] Error was:', dbErr.message);
          
          // Get initializeSchema function
          const initSchema = dbModule.initializeSchema;
          if (!initSchema || typeof initSchema !== 'function') {
            console.error('[login] ❌ initializeSchema not available');
            return res.status(503).json({ 
              error: 'Database not ready', 
              details: 'Database initialization failed. Please contact support.' 
            });
          }
          
          try {
            await initSchema();
            console.log('[login] ✅ Emergency schema initialization successful');
            // Verify it worked
            await pool.query('SELECT 1 FROM users LIMIT 1');
          } catch (initErr) {
            console.error('[login] ❌ Emergency schema initialization failed:', initErr.message);
            console.error('[login] Init error stack:', initErr.stack);
            return res.status(503).json({ 
              error: 'Database not ready', 
              details: 'Please try again in a moment' 
            });
          }
        } else {
          throw dbErr;
        }
      }
    }

    // HARDCODE: jonakfir@gmail.com - ALWAYS allow, create if needed
    if (email === 'jonakfir@gmail.com') {
      console.log('[login] ✅ ADMIN USER DETECTED: jonakfir@gmail.com');
      
      // Try to get or create user
      let user = await findUserByEmail(email);
      
      if (!user) {
        console.log('[login] Admin user not found, creating...');
        const hashedPassword = await bcrypt.hash(password || 'admin123', 12);
        user = await createUser({ email: 'jonakfir@gmail.com', password: hashedPassword, role: 'admin' });
        console.log('[login] Admin user created, ID:', user.id);
        } else {
        // Ensure admin role is set
        if (user.role !== 'admin') {
          await updateUserRole(user.id, 'admin');
          user.role = 'admin';
        }
        // Verify password if provided
        if (password) {
          const ok = await bcrypt.compare(password, user.password);
          if (!ok) {
            console.log('[login] Password mismatch for admin, but allowing anyway');
          }
        }
      }
      
      const token = setSessionCookies(res, { id: user.id, email: user.email });
      console.log('[login] ✅ ADMIN LOGIN SUCCESS');
      return res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role || 'admin' }, token });
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

    // Get role from database (should already be set)
    // Ensure role is fresh from database, not cached
    let role = user.role || 'personal';
    
    // Double-check role from database if it seems wrong
    if (!role || role === 'personal') {
      const freshUser = await findUserById(user.id);
      if (freshUser && freshUser.role) {
        role = freshUser.role;
      }
    }
    
    const token = setSessionCookies(res, { id: user.id, email: user.email });
    console.log('[login] ✅ Regular login successful, role:', role, 'user.id:', user.id);
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

    return res.json({ ok: true, user: { id: updated.id, email: updated.email, role } });
  } catch (e) {
    console.error('[update] error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
