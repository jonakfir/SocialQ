// POST/GET /api/collages - Proxy to SvelteKit frontend so iOS upload works when API_BASE_URL points at this backend
const express = require('express');
const router = express.Router();

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.PUBLIC_WEB_APP_URL || '').replace(/\/$/, '');
const PROXY_SECRET = process.env.PROXY_SECRET || process.env.BACKEND_PROXY_SECRET || '';

async function proxyToFrontend(req, res) {
  if (!FRONTEND_URL) {
    return res.status(503).json({ ok: false, error: 'Upload not configured. Set FRONTEND_URL on the server.' });
  }
  const url = `${FRONTEND_URL}/api/collages`;
  const headers = { ...req.headers };
  delete headers.host;
  if (PROXY_SECRET) headers['X-Proxy-Secret'] = PROXY_SECRET;
  const opts = { method: req.method, headers };
  if (req.method !== 'GET' && req.body && req.body.length) {
    opts.body = req.body;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const proxyRes = await fetch(url, opts);
    const text = await proxyRes.text();
    try {
      const data = JSON.parse(text);
      res.status(proxyRes.status).json(data);
    } catch {
      res.status(proxyRes.status).contentType(proxyRes.headers.get('content-type') || 'text/plain').send(text);
    }
  } catch (e) {
    console.error('[api/collages] proxy error:', e.message || e);
    res.status(502).json({ ok: false, error: 'Upload service unavailable. Try again later.' });
  }
}

router.all('/', (req, res, next) => {
  if (req.method !== 'POST' && req.method !== 'GET') return next();
  proxyToFrontend(req, res);
});

module.exports = router;
