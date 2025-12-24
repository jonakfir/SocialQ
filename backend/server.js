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

// Mount WhatsApp webhook routes BEFORE CORS (Meta webhooks don't need CORS)
// Add logging middleware to catch ALL requests to webhooks
app.use('/webhooks', (req, res, next) => {
  console.log(`\n[Webhook Middleware] ${req.method} ${req.path} at ${new Date().toISOString()}`);
  console.log('[Webhook Middleware] Query:', JSON.stringify(req.query));
  console.log('[Webhook Middleware] Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

try {
  app.use('/webhooks', require('./routes/webhooks-whatsapp'));
  console.log('[Server] ✅ WhatsApp webhook routes mounted at /webhooks/whatsapp');
} catch (err) {
  console.warn('[Server] WhatsApp webhook routes not available:', err.message);
}

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight

// ---------------- Database Schema Initialization ----------------
app.post('/debug/init-schema', async (_req, res) => {
  try {
    const { initializeSchema } = require('./db/db');
    console.log('[Init Schema] Starting manual schema initialization...');
    const result = await initializeSchema();
    
    if (result) {
      return res.json({ 
        ok: true, 
        message: 'Database schema initialized successfully. Tables should now exist.' 
      });
    } else {
      return res.status(500).json({ 
        ok: false, 
        error: 'Schema initialization failed. Check server logs for details.' 
      });
    }
  } catch (error) {
    console.error('[Init Schema] Error:', error);
    return res.status(500).json({ 
      ok: false, 
      error: error.message,
      details: 'Check Railway logs for more information'
    });
  }
});

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
          // Check if users table exists
          const result = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'users'
            );
          `);
          
          if (!result.rows[0].exists) {
            console.log('[DB] Users table missing - initializing schema...');
            const { initializeSchema } = require('./db/db');
            await initializeSchema();
            console.log('[DB] ✅ Emergency schema initialization complete');
          }
          dbReady = true;
          return true;
        } catch (err) {
          console.error('[DB] ❌ Failed to ensure database ready:', err.message);
          console.error('[DB] Error stack:', err.stack);
          // Don't block requests - let individual routes handle errors
          return false;
        }
      }
      return true;
    })();
  }
  
  return await dbInitPromise;
}

// Apply middleware to all routes except health check and auth routes (they handle their own checks)
app.use(async (req, res, next) => {
  // Skip middleware for health check and auth routes (they handle DB checks themselves)
  if (req.path === '/health' || req.path.startsWith('/auth/')) {
    return next();
  }
  
  // For other routes, try to ensure DB is ready but don't block if it fails
  try {
    await ensureDatabaseReady();
  } catch (err) {
    console.error('[DB Middleware] Error checking database:', err.message);
    // Continue anyway - let the route handle the error
  }
  next();
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

// Check WABA subscription status
app.get('/debug/check-waba-subscription', async (req, res) => {
  if (!WA_TOKEN) {
    return res.status(400).json({ error: 'WHATSAPP_TOKEN not set' });
  }

  let wabaId = req.query.waba_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  
  if (!wabaId && WA_PHONE_ID) {
    const p = await gget(`/${WA_PHONE_ID}?fields=whatsapp_business_account`);
    wabaId = p?.json?.whatsapp_business_account?.id;
  }

  if (!wabaId) {
    return res.status(400).json({ error: 'WABA ID not found' });
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
  console.log(`[Check WABA] Checking subscription for ${wabaId}...`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.json({ 
      ok: response.ok, 
      waba_id: wabaId,
      subscription_status: data,
      message: response.ok ? 'Check the "data" array to see subscribed apps' : 'Failed to check subscription'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Check webhook configuration from Meta's side
app.get('/debug/check-webhook-config', async (req, res) => {
  if (!WA_TOKEN) {
    return res.status(400).json({ error: 'WHATSAPP_TOKEN not set' });
  }

  const appId = '1493031701729261';
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1301560021226248';

  try {
    // Get webhook subscriptions for the app
    const webhookUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/subscriptions`;
    const webhookRes = await fetch(webhookUrl, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` }
    });
    const webhookData = await webhookRes.json().catch(() => ({}));

    // Get WABA subscribed apps
    const subUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
    const subRes = await fetch(subUrl, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` }
    });
    const subData = await subRes.json().catch(() => ({}));

    return res.json({
      ok: true,
      app_id: appId,
      waba_id: wabaId,
      webhook_subscriptions: webhookData,
      waba_subscribed_apps: subData,
      message: 'Check webhook_subscriptions for callback_url and subscribed_fields'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Check phone number association and webhook subscription
app.get('/debug/check-phone-webhook', async (req, res) => {
  if (!WA_TOKEN) {
    return res.status(400).json({ error: 'WHATSAPP_TOKEN not set' });
  }

  if (!WA_PHONE_ID) {
    return res.status(400).json({ error: 'WHATSAPP_PHONE_NUMBER_ID not set' });
  }

  try {
    // Get phone number details (without whatsapp_business_account field to avoid error)
    const phoneInfo = await gget(`/${WA_PHONE_ID}?fields=display_phone_number,verified_name`);
    
    // Get WABA ID from env or use the one we know
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1301560021226248';
    
    if (!wabaId) {
      return res.status(400).json({ error: 'Could not determine WABA ID' });
    }

    // Check WABA subscription
    const subUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
    const subRes = await fetch(subUrl, {
      headers: { 'Authorization': `Bearer ${WA_TOKEN}` }
    });
    const subData = await subRes.json().catch(() => ({}));

    return res.json({
      ok: true,
      phone_number_id: WA_PHONE_ID,
      phone_info: phoneInfo?.json,
      waba_id: wabaId,
      waba_subscribed_apps: subData,
      message: 'Check if your app ID (1493031701729261) is in the subscribed_apps data array'
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Subscribe WABA to app for webhooks (run this once)
app.post('/debug/subscribe-waba', async (req, res) => {
  if (!WA_TOKEN) {
    return res.status(400).json({ error: 'WHATSAPP_TOKEN not set' });
  }

  // Get WABA ID from phone number if not provided
  let wabaId = req.body.waba_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  
  if (!wabaId && WA_PHONE_ID) {
    console.log('[Subscribe WABA] Discovering WABA ID from phone number...');
    const p = await gget(`/${WA_PHONE_ID}?fields=whatsapp_business_account`);
    wabaId = p?.json?.whatsapp_business_account?.id;
  }

  if (!wabaId) {
    return res.status(400).json({ 
      error: 'WABA ID not found. Set WHATSAPP_BUSINESS_ACCOUNT_ID or provide waba_id in request body',
      hint: 'Your WABA ID is: 1301560021226248 (from Meta dashboard)'
    });
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
  console.log(`[Subscribe WABA] Subscribing ${wabaId} to app...`);
  console.log(`[Subscribe WABA] URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (response.ok) {
      console.log('[Subscribe WABA] ✅ Success! WABA subscribed to app.');
      console.log('[Subscribe WABA] Response:', JSON.stringify(data, null, 2));
      return res.json({ 
        ok: true, 
        message: 'WABA successfully subscribed to app. Real messages should now trigger webhooks!',
        data 
      });
    } else {
      console.error('[Subscribe WABA] ❌ Failed:', response.status, data);
      return res.status(response.status).json({ 
        ok: false, 
        error: 'Failed to subscribe WABA',
        status: response.status,
        data 
      });
    }
  } catch (error) {
    console.error('[Subscribe WABA] ❌ Error:', error.message);
    return res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
});

// Force re-subscribe WABA (sometimes needed after mode changes)
app.post('/debug/resubscribe-waba', async (req, res) => {
  if (!WA_TOKEN) {
    return res.status(400).json({ error: 'WHATSAPP_TOKEN not set' });
  }

  const wabaId = req.body.waba_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1301560021226248';
  const appId = '1493031701729261';

  try {
    // First, unsubscribe
    console.log(`[Re-subscribe] Unsubscribing ${wabaId} from app ${appId}...`);
    const unsubUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps?app_id=${appId}`;
    await fetch(unsubUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Then re-subscribe
    console.log(`[Re-subscribe] Re-subscribing ${wabaId} to app...`);
    const subUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`;
    const response = await fetch(subUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (response.ok) {
      return res.json({ 
        ok: true, 
        message: 'WABA re-subscribed successfully. Try sending a message now.',
        data 
      });
    } else {
      return res.status(response.status).json({ 
        ok: false, 
        error: 'Failed to re-subscribe',
        status: response.status,
        data 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      ok: false, 
      error: error.message 
    });
  }
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
// Start server immediately - don't wait for schema init
// Schema will initialize in background and requests will wait via ensureDatabaseReady middleware
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
  console.log('[DB] ⚠️  Database schema initializing in background...');
  console.log('[DB] ⚠️  First requests may be slower until schema is ready');
});

// Initialize schema in background (non-blocking)
schemaInitPromise
  .then(async () => {
    console.log('[DB] ✅ Schema initialization completed successfully');
    
    // For PostgreSQL, verify tables exist
    if (pool) {
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
          dbReady = true;
        } else {
          console.log('[DB] ⚠️  Users table not found, schema may need initialization');
          // Don't block - let middleware handle it
        }
      } catch (err) {
        console.error('[DB] ⚠️  Verification failed:', err.message);
        // Don't block - let middleware handle retries
      }
    } else {
      dbReady = true;
    }
  })
  .catch((err) => {
    console.error('[DB] ⚠️  Schema initialization error (non-fatal):', err.message);
    console.error('[DB] ⚠️  Server will continue, but database operations may fail');
    // Don't exit - let the middleware handle retries
  });
