// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const upload = multer(); // for form-data bodies (no files required here)

// Optional DB helpers (keep if you use them)
let findUserById = () => null;
let deleteUserById = () => {};
let countUsers = () => Promise.resolve(0);
let getUserRole = () => Promise.resolve(null);
let db = null;
let pool = null;
let schemaInitPromise = Promise.resolve();
try {
  const dbModule = require('./db/db');
  ({ findUserById, deleteUserById, countUsers, getUserRole, db, pool, schemaInitPromise } = dbModule);
} catch { /* ok if you don't have db */ }

// -------------------- Env --------------------
const PORT = Number(process.env.PORT) || 8080;

// WhatsApp / Meta
const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';
const WA_TOKEN = (process.env.WHATSAPP_TOKEN || '').trim();
const WA_PHONE_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const WA_TEMPLATE = (process.env.WHATSAPP_TEMPLATE || 'emotion_report_v1').trim();
const WA_TEMPLATE_LANG = (process.env.WHATSAPP_TEMPLATE_LANG || 'en_US').trim();

// node-fetch v3 is ESM — dynamic import wrapper:
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

// -------------------- App --------------------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ------------- Middleware -------------
app.use(express.json());
app.use(cookieParser());

// -------- CORS --------
const RAW_ORIGINS =
  process.env.FRONTEND_ORIGINS || // comma-separated
  process.env.FRONTEND_ORIGIN ||  // single
  'http://localhost:5173,http://localhost:5174';

const exactAllowed = String(RAW_ORIGINS)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const PREVIEW_SUFFIX = process.env.VERCEL_PREVIEW_SUFFIX || ''; // e.g. ".vercel.app"

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/health
  try {
    const { protocol, host } = new URL(origin);
    if (exactAllowed.includes(origin)) return true;
    if (origin.startsWith('http://localhost:')) return true;
    // Allow all Vercel preview and production domains
    if (protocol === 'https:' && (host.endsWith('.vercel.app') || host.endsWith('.vercel.app/'))) return true;
    if (PREVIEW_SUFFIX && protocol === 'https:' && host.endsWith(PREVIEW_SUFFIX)) return true;
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

// ---------------- Auth helpers ----------------
function getCurrentUserId(req) {
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);
  const idFromCookie = Number(req.cookies?.uid) || Number(req.cookies?.userId) || null;
  return idFromCookie || null;
}

function requireAuth(req, res, next) {
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.currentUserId = userId;
  next();
}

function clearAuth(req, res) {
  res.clearCookie('uid',    { httpOnly: true, sameSite: 'lax', secure: true });
  res.clearCookie('userId', { httpOnly: true, sameSite: 'lax', secure: true });
  if (req.session && typeof req.session.destroy === 'function') {
    req.session.destroy(() => {});
  }
}

// ------------------------------------------------------------------
// Account deletion route used by the iOS app: POST /auth/delete
// Cookie-session based, returns { ok: true } on success.
// ------------------------------------------------------------------
app.post('/auth/delete', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;

    const existing = await findUserById(userId);
    if (!existing) {
      clearAuth(req, res);
      return res.status(200).json({ ok: true, alreadyDeleted: true });
    }

    await deleteUserById(userId);
    clearAuth(req, res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[/auth/delete] error:', e);
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// Keep your existing auth router if present
try {
  app.use('/auth', require('./routes/auth'));
} catch {
  // ok if you don't have it locally
}

// Mount organization and relationship routes
try {
  app.use('/organizations', require('./routes/organizations'));
} catch {
  console.warn('[Server] Organizations routes not available');
}

try {
  app.use('/relationships', require('./routes/relationships'));
} catch {
  console.warn('[Server] Relationships routes not available');
}

// ---------------- WhatsApp helpers ----------------
function normalizeTo(num) {
  // Meta examples often use digits only (strip leading +)
  return String(num || '').trim().replace(/^\+/, '');
}

async function sendWhatsAppTemplate({ to, template, components = [], lang = 'en_US' }) {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    throw new Error('WhatsApp env not set (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)');
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizeTo(to),
    type: 'template',
    template: {
      name: template,
      language: { code: lang },
      components
    }
  };

  // Log what we actually send (helps with template/lang issues)
  console.log('[WA] POST', url);
  console.log('[WA] Payload:', JSON.stringify(payload));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[/notify/emotion] WhatsApp send failed:', res.status, text);
    throw new Error(`WhatsApp send failed: ${res.status} ${text}`);
  }
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

// ---- Quick Graph helpers for debugging
async function gget(path) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const txt = await res.text();
  try { return { ok: res.ok, status: res.status, json: JSON.parse(txt) }; }
  catch { return { ok: res.ok, status: res.status, text: txt }; }
}

// What WABA owns this phone number id?
app.get('/debug/wa-phone', async (_req, res) => {
  if (!WA_PHONE_ID) return res.status(400).json({ error: 'WA_PHONE_ID missing' });
  const r = await gget(`/${WA_PHONE_ID}?fields=display_phone_number,verified_name,whatsapp_business_account`);
  res.status(r.ok ? 200 : 500).json(r.json ?? { status: r.status, text: r.text });
});

// List templates under a WABA (pass ?waba=<WABA_ID>, or we’ll try to discover)
app.get('/debug/wa-templates', async (req, res) => {
  let waba = req.query.waba;
  if (!waba) {
    const p = await gget(`/${WA_PHONE_ID}?fields=whatsapp_business_account`);
    waba = p?.json?.whatsapp_business_account?.id;
  }
  if (!waba) return res.status(400).json({ error: 'Could not determine WABA id; pass ?waba=...' });

  const r = await gget(`/${waba}/message_templates?fields=name,languages,status`);
  res.status(r.ok ? 200 : 500).json(r.json ?? { status: r.status, text: r.text });
});

// ---------------- Notify endpoint ----------------
// Accepts form-data (no file required):
//   to="+15551234567"
//   emotion="Happy"
//   confidence="92.3%"
// Optional overrides (useful while debugging):
//   template="emotion_report_v1"
//   lang="en"    // or en_US / en_GB exactly as listed in /debug/wa-templates
app.post('/notify/emotion', upload.none(), async (req, res) => {
  try {
    const to = req.body.to || req.body.whatsapp_to;
    const emotion = String(req.body.emotion || 'Unknown');
    const confidence = String(req.body.confidence || '0%');

    // Allow runtime override while you test
    const template = (req.body.template || WA_TEMPLATE).trim();
    const lang = (req.body.lang || WA_TEMPLATE_LANG).trim() || 'en_US';

    if (!to) {
      return res.status(400).json({ ok: false, error: 'Missing "to" phone number' });
    }

    await sendWhatsAppTemplate({
      to,
      template,
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: emotion },     // {{emotion}}
            { type: 'text', text: confidence }   // {{confidence}}
          ]
        }
      ],
      lang
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[/notify/emotion]', e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// Helper to check if user is admin
async function isAdmin(userId) {
  if (!userId) return false;
  try {
    const role = await getUserRole(userId);
    return role === 'admin';
  } catch {
    // Fallback: check email for jonakfir@gmail.com
    const user = await findUserById(userId);
    return user?.email?.toLowerCase() === 'jonakfir@gmail.com';
  }
}

// ---------------- Admin Stats ----------------
app.get('/admin/stats', requireAuth, async (req, res) => {
  try {
    // Check if user is admin using database role
    const userIsAdmin = await isAdmin(req.currentUserId);
    
    if (!userIsAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const totalUsers = await countUsers();
    
    // For now, return basic stats (sessions would need a separate table)
    return res.json({
      ok: true,
      stats: {
        totalUsers,
        totalSessions: 0, // TODO: implement if needed
        todaySessions: 0,
        todayActiveUsers: 0,
        adminCount: 1 // At least one admin (jonakfir@gmail.com)
      }
    });
  } catch (e) {
    console.error('[/admin/stats] error:', e);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------------- Admin Users ----------------
app.get('/admin/users', requireAuth, async (req, res) => {
  try {
    // Check if user is admin using database role
    const userIsAdmin = await isAdmin(req.currentUserId);
    
    if (!userIsAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Get all users from backend PostgreSQL
    let users = [];
    if (pool) {
      // PostgreSQL
      const result = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC');
      users = result.rows.map(row => ({
        id: row.id,
        email: row.email,
        username: row.email,
        role: row.role || 'personal',
        createdAt: row.created_at
      }));
    } else if (db) {
      // SQLite
      const allUsers = db.prepare('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC').all();
      users = allUsers.map(u => ({
        id: u.id,
        email: u.email,
        username: u.email,
        role: u.role || 'personal',
        createdAt: u.created_at
      }));
    }
    
    return res.json({ ok: true, users });
  } catch (e) {
    console.error('[/admin/users] error:', e);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---------------- 404 & errors ----------------
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------------- Boot ----------------
// Start server immediately, initialize schema in background
// This ensures healthcheck works even if schema init takes time
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed exact CORS origins:', exactAllowed.join(', ') || '(none)');
  if (PREVIEW_SUFFIX) console.log('Also allowing preview suffix:', PREVIEW_SUFFIX);
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('GRAPH_VERSION:', GRAPH_VERSION);
  console.log('WA_PHONE_ID set:', !!WA_PHONE_ID);
  console.log('WA_TEMPLATE:', WA_TEMPLATE);
  console.log('========================================');
  
  // Initialize schema in background (non-blocking)
  schemaInitPromise
    .then(() => {
      console.log('[DB] ✅ Schema initialization completed successfully');
    })
    .catch((err) => {
      console.error('[DB] ❌ Schema initialization error:', err.message);
      console.error('[DB] Server will continue but database operations may fail');
    });
});
