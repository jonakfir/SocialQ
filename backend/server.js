// backend/server.js
require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Routers
const authRoutes = require('./routes/auth');

const app = express();

// --- Basic app setup ---
app.disable('x-powered-by');
app.use(express.json());
app.use(cookieParser());

// If you're behind a proxy/load balancer (Railway/Render/Heroku/Vercel/NGINX),
// this is required so secure cookies work correctly.
app.set('trust proxy', 1);

// --- CORS (dev & prod) ---
// Support a single origin via FRONTEND_ORIGIN or multiple via FRONTEND_ORIGINS (comma-separated)
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
    origin: function (origin, callback) {
      // Allow non-browser requests (like curl/postman) where origin is undefined
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  })
);

// Preflight for all routes
app.options('*', cors());

// --- Routes ---
app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// --- Not Found handler ---
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// --- Error handler (last) ---
app.use((err, req, res, next) => {
  console.error('[Server Error]', err?.message || err);
  res
    .status(err.status || 500)
    .json({ error: err.message || 'Server error' });
});

// --- Start server ---
const PORT = process.env.PORT || 4000;
// Bind on 0.0.0.0 so it’s reachable from Docker/Render/Railway/etc.
app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log(`API listening on :${PORT}`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', '));
  console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('========================================');
});
 