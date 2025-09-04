// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Body + cookies
app.use(express.json());
app.use(cookieParser());

// -------- CORS --------
// Comma-separated list of exact origins you allow (prod + preview + local)
const RAW_ORIGINS =
  process.env.FRONTEND_ORIGINS /* e.g. "https://yourapp.vercel.app,https://yourapp-git-main-yourteam.vercel.app" */ ||
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:5173';

const exactAllowed = String(RAW_ORIGINS)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Optional: allow any preview whose host ends with this suffix.
// Example: "-jonathan-kfirs-projects.vercel.app"
const PREVIEW_SUFFIX = process.env.VERCEL_PREVIEW_SUFFIX || ''; // empty = disabled

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, health checks, server-to-server
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

// Health
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// Routes
app.use('/auth', require('./routes/auth'));

// 404 + errors
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// Boot
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed exact CORS origins:', exactAllowed.join(', ') || '(none)');
  if (PREVIEW_SUFFIX) console.log('Also allowing preview suffix:', PREVIEW_SUFFIX);
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('========================================');
});
