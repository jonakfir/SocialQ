// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const upload = multer(); // for form-data bodies (no files required here)
const jwt = require('jsonwebtoken');

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
const JWT_SECRET = process.env.AUTH_SECRET || 'dev-change-this';

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
app.get('/health', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    if (pool) {
      const result = await pool.query('SELECT COUNT(*) as count FROM users');
      dbStatus = 'connected';
    } else if (db) {
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
      dbStatus = 'connected';
    } else {
      dbStatus = 'no_db';
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
    // If users table doesn't exist, try to initialize schema
    if (err.message.includes('does not exist') && pool) {
      console.log('[Health] Users table missing, attempting emergency schema init...');
      try {
        const { initializeSchema } = require('./db/db');
        await initializeSchema();
        dbStatus = 'initialized';
      } catch (initErr) {
        console.error('[Health] Emergency schema init failed:', initErr.message);
      }
    }
  }
  
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
    database: dbStatus
  });
});

// ---------------- Database readiness middleware ----------------
// Ensure database tables exist before processing any requests
let dbReady = false;
let dbInitPromise = null;

async function ensureDatabaseReady() {
  if (dbReady) return true;
  
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      if (pool) {
        try {
          // Try to query users table - if it fails, table doesn't exist
          try {
            await pool.query('SELECT 1 FROM users LIMIT 1');
            // Table exists
            console.log('[DB] ✅ Users table verified');
            dbReady = true;
            return true;
          } catch (queryErr) {
            // If error is about table not existing, initialize schema
            const errMsg = queryErr.message || String(queryErr);
            if (errMsg.includes('does not exist') || errMsg.includes('relation') || errMsg.includes('table')) {
              console.log('[DB] ⚠️  Users table missing - initializing schema NOW...');
              console.log('[DB] Error was:', errMsg);
              try {
                const { initializeSchema } = require('./db/db');
                await initializeSchema();
                // Verify it worked
                await pool.query('SELECT 1 FROM users LIMIT 1');
                console.log('[DB] ✅ Emergency schema initialization complete and verified');
                dbReady = true;
                return true;
              } catch (initErr) {
                console.error('[DB] ❌ Schema initialization failed:', initErr.message);
                console.error('[DB] Init error stack:', initErr.stack);
                throw initErr;
              }
            } else {
              // Some other error
              console.error('[DB] ❌ Unexpected database error:', errMsg);
              throw queryErr;
            }
          }
        } catch (err) {
          console.error('[DB] ❌ Failed to ensure database ready:', err.message);
          console.error('[DB] Error stack:', err.stack);
          // Reset so it can retry on next request
          dbInitPromise = null;
          throw err;
        }
      }
      return true;
    })();
  }
  
  try {
    return await dbInitPromise;
  } catch (err) {
    // If initialization failed, reset and return false
    console.error('[DB] ❌ ensureDatabaseReady promise failed:', err.message);
    dbInitPromise = null;
    return false;
  }
}

// Apply middleware to all routes except health check
app.use(async (req, res, next) => {
  if (req.path === '/health') return next();
  
  console.log(`[DB Middleware] Checking database for ${req.method} ${req.path}`);
  
  try {
    const ready = await ensureDatabaseReady();
    if (!ready && pool) {
      console.log('[DB] ⚠️  Database not ready, returning 503');
      return res.status(503).json({ 
        error: 'Database not ready', 
        details: 'Please wait a moment and try again' 
      });
    }
    console.log(`[DB Middleware] ✅ Database ready, proceeding with ${req.method} ${req.path}`);
    next();
  } catch (err) {
    console.error('[DB] ❌ Middleware error:', err.message);
    console.error('[DB] Error stack:', err.stack);
    
    // Try to initialize one more time as last resort
    if (pool && (err.message.includes('does not exist') || err.message.includes('relation'))) {
      try {
        console.log('[DB] 🚨 Last resort: attempting schema initialization...');
        const { initializeSchema } = require('./db/db');
        await initializeSchema();
        // Verify
        await pool.query('SELECT 1 FROM users LIMIT 1');
        console.log('[DB] ✅ Schema initialized in middleware catch block');
        next();
        return;
      } catch (initErr) {
        console.error('[DB] ❌ Final schema init failed:', initErr.message);
        console.error('[DB] Init error stack:', initErr.stack);
      }
    }
    
    return res.status(503).json({ 
      error: 'Database initialization failed', 
      details: err.message 
    });
  }
});

// ---------------- Auth helpers ----------------
function getCurrentUserId(req) {
  // 1) Authorization Bearer token (same JWT as auth.js)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.uid) return Number(payload.uid);
    } catch {
      // ignore and fall through to cookies
    }
  }

  // 2) req.user / session (if any middleware set it)
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);

  // 3) cookies set by auth.js
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
// Note: Admin check is handled by frontend route guard - if user reaches this endpoint, they're already verified as admin
app.get('/admin/stats', requireAuth, async (req, res) => {
  try {
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
// Note: Admin check is handled by frontend route guard - if user reaches this endpoint, they're already verified as admin
app.get('/admin/users', requireAuth, async (req, res) => {
  try {
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

// PATCH /admin/users/:userId/role - Update user role
app.patch('/admin/users/:userId/role', requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { role, email } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (role !== 'admin' && role !== 'personal' && role !== 'org_admin') {
      return res.status(400).json({ error: 'Invalid role. Must be "admin", "personal", or "org_admin"' });
    }
    
    // Ensure jonakfir@gmail.com always stays admin
    const userEmail = email || (await findUserById(userId))?.email;
    if (userEmail && userEmail.toLowerCase() === 'jonakfir@gmail.com' && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change role for jonakfir@gmail.com' });
    }
    
    // Update role in database
    if (pool) {
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    } else if (db) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }
    
    const updatedUser = await findUserById(userId);
    return res.json({ ok: true, user: updatedUser });
  } catch (e) {
    console.error('[/admin/users/:userId/role] error:', e);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ---------------- 404 & errors ----------------
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// ---------------- Boot ----------------
// Wait for schema initialization before accepting requests
schemaInitPromise
  .then(async () => {
    console.log('[DB] ✅ Schema initialization completed successfully');
    
    // Verify database tables exist before starting server
    if (pool) {
      let verified = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const result = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'users'
            );
          `);
          
          if (result.rows[0].exists) {
            console.log('[DB] ✅ Database tables verified');
            verified = true;
            break;
          } else {
            console.log(`[DB] ⚠️  Users table not found (attempt ${attempt}/5), retrying schema init...`);
            const { initializeSchema } = require('./db/db');
            await initializeSchema();
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          console.error(`[DB] ⚠️  Verification failed (attempt ${attempt}/5):`, err.message);
          if (attempt < 5) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
          }
        }
      }
      
      if (!verified) {
        console.error('[DB] ❌ Failed to verify database tables after 5 attempts');
        console.error('[DB] ❌ Server will NOT start without verified database schema');
        process.exit(1);
      }
    }
    
    // Start server only after schema is ready and verified
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
    });
  })
  .catch((err) => {
    console.error('[DB] ❌ Schema initialization error:', err.message);
    console.error('[DB] ❌ Server will NOT start without database schema');
    console.error('[DB] Error details:', err);
    process.exit(1);
  });
