// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const {
  findUserById,
  deleteUserById
} = require('./db/db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ------------- Middleware -------------
app.use(express.json());
app.use(cookieParser());

// -------- CORS --------
// Comma-separated list of exact origins you allow (prod + preview + local)
const RAW_ORIGINS =
  process.env.FRONTEND_ORIGINS /* "https://yourapp.com,https://preview-yourapp.com" */ ||
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:5174';

const exactAllowed = String(RAW_ORIGINS)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Optional: allow any preview whose host ends with this suffix
const PREVIEW_SUFFIX = process.env.VERCEL_PREVIEW_SUFFIX || ''; // empty = disabled

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, health checks
  try {
    const { protocol, host } = new URL(origin);
    if (exactAllowed.includes(origin)) return true;
    if (PREVIEW_SUFFIX && protocol === 'https:' && host.endsWith(PREVIEW_SUFFIX)) return true;
    if (origin.startsWith('http://localhost:')) return true;
    return false;
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight

// ---------------- Health ----------------
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// ---------------- Helpers ----------------
/**
 * Resolve current user id from common places.
 * Adjust this to match your auth approach if needed.
 */
function getCurrentUserId(req) {
  // If some middleware has already attached req.user or req.session.user
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);

  // Otherwise fall back to simple cookies you can set at login
  const idFromCookie =
    Number(req.cookies?.uid) ||
    Number(req.cookies?.userId) ||
    null;

  return idFromCookie || null;
}

/**
 * Simple auth gate that ensures we have a current user id
 */
function requireAuth(req, res, next) {
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.currentUserId = userId;
  next();
}

// ------------------------------------------------------------------
// Account deletion route used by the iOS app: POST /auth/delete
// Cookie-session based, returns { ok: true } on success.
// ------------------------------------------------------------------
app.post('/auth/delete', requireAuth, (req, res) => {
  try {
    const userId = req.currentUserId;

    const existing = findUserById(userId);
    if (!existing) {
      // Idempotent success if already removed
      // (Change to 404 if you prefer strict behavior.)
      clearAuth(req, res);
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }

    deleteUserById(userId);
    clearAuth(req, res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[/auth/delete] error:', e);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

function clearAuth(req, res) {
  // If you set simple cookies for auth, clear them here
  res.clearCookie('uid',    { httpOnly: true, sameSite: 'lax', secure: true });
  res.clearCookie('userId', { httpOnly: true, sameSite: 'lax', secure: true });
  // If you use express-session, you can destroy it:
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {});
  }
}

// ---------------- Mount other routes ----------------
app.use('/auth', require('./routes/auth')); // keep your existing auth router

// ---------------- 404 & errors ----------------
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------------- Boot ----------------
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed exact CORS origins:', exactAllowed.join(', ') || '(none)');
  if (PREVIEW_SUFFIX) console.log('Also allowing preview suffix:', PREVIEW_SUFFIX);
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('========================================');
});
