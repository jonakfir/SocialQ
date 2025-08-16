// backend/server.js

// 1) Load env (Railway injects real env vars; .env is optional)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

// --- Basic app setup ---
app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);

// --- CORS ---
const devDefault = 'http://localhost:5173';
const rawOrigins =
  process.env.FRONTEND_ORIGINS ||
  process.env.FRONTEND_ORIGIN ||
  devDefault;

const allowedOrigins = String(rawOrigins)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);             // curl/healthcheck/etc
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  })
);
app.options('*', cors());

// --- Healthcheck FIRST (so app is healthy even if other imports fail) ---
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// --- Routes (guard against startup crashes) ---
let authRoutes = express.Router();
try {
  authRoutes = require('./routes/auth');
} catch (err) {
  console.error('[BOOT] Failed to load ./routes/auth:', err);
}
app.use('/auth', authRoutes);

// --- 404 ---
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// --- Error handler ---
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err?.stack || err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

// Log any unhandled crashes so they show in Railway Deploy Logs
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

// --- Start server ---
const PORT = Number(process.env.PORT) || 8080; // Railway provides PORT
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', ') || '(none)');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('========================================');
});
