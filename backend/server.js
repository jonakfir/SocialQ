// backend/server.js
require('dotenv').config();           // no custom path; optional on Railway

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);

// CORS
const devDefault = 'http://localhost:5173';
const rawOrigins =
  process.env.FRONTEND_ORIGINS ||
  process.env.FRONTEND_ORIGIN ||
  devDefault;

// exact origins you explicitly allow
const exactAllowed = String(rawOrigins)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// allow all previews under your Vercel team/project domain
const PREVIEW_SUFFIX = '-jonathan-kfirs-projects.vercel.app'; // adjust if your suffix differs

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/healthchecks/postman
  try {
    const { protocol, host } = new URL(origin);
    if (exactAllowed.includes(origin)) return true;
    if (protocol === 'https:' && host.endsWith(PREVIEW_SUFFIX)) return true; // any Vercel preview of your project
    if (origin.startsWith('http://localhost:')) return true;
    return false;
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  credentials: true, // needed for cookies
};

app.use(cors(corsOptions));
// IMPORTANT: use the SAME options for preflight
app.options('*', cors(corsOptions));

// HEALTHCHECK FIRST
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// ROUTES (guarded)
let authRoutes = require('express').Router();
try {
  authRoutes = require('./routes/auth'); // if this throws, server still starts
} catch (err) {
  console.error('[BOOT] Failed to load ./routes/auth:', err);
}
app.use('/auth', authRoutes);

// 404 + Error
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// Crash logging
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException', e => console.error('[uncaughtException]', e));

// LISTEN on $PORT (Railway sets this)
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', ') || '(none)');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('========================================');
});
