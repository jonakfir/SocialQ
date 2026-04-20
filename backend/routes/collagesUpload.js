// POST /api/collages - Save collage on backend. No FK on Collage.userId so insert never fails.
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { pool } = require('../db/db');
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.PUBLIC_WEB_APP_URL || '').replace(/\/$/, '');
const PROXY_SECRET = process.env.PROXY_SECRET || process.env.BACKEND_PROXY_SECRET || '';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function generateId() {
  return crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').slice(0, 25);
}

async function handlePost(req, res) {
  try {
    const body = req.body || {};
    const userEmail = (body.userEmail || '').trim().toLowerCase();
    const userId = parseInt(body.userId, 10);
    if (!userEmail || !Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ ok: false, error: 'Unauthorized - Please log in first' });
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ ok: false, error: 'No file provided' });
    }
    const emotions = body.emotions ? (() => { try { const e = JSON.parse(body.emotions); return Array.isArray(e) ? JSON.stringify(e) : null; } catch { return null; } })() : null;
    const approvedAnyway = body.approvedAnyway === 'true' || body.approvedAnyway === '1';
    const folder = approvedAnyway ? 'Unverified Photos' : 'Verified Photos';
    const mime = file.mimetype || 'image/png';
    const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;

    if (!pool) {
      return res.status(503).json({ ok: false, error: 'Database not available' });
    }

    // Use client's userId; Collage table has no FK so this always succeeds
    const id = generateId();
    await pool.query(
      `INSERT INTO "Collage" ("id", "userId", "imageUrl", "emotions", "folder", "approvedAnyway", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id, userId, dataUrl, emotions, folder, approvedAnyway]
    );

    console.log('[api/collages] Saved collage', id, 'userId', userId, 'folder', folder);
    return res.json({
      ok: true,
      collage: { id, imageUrl: dataUrl, emotions: emotions ? JSON.parse(emotions) : null, folder, createdAt: new Date().toISOString() }
    });
  } catch (err) {
    console.error('[api/collages] POST error:', err.message || err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to save collage' });
  }
}

async function proxyGet(req, res) {
  if (!FRONTEND_URL) {
    return res.status(503).json({ ok: false, error: 'Set FRONTEND_URL for GET /api/collages' });
  }
  const headers = { ...req.headers };
  delete headers.host;
  if (PROXY_SECRET) headers['X-Proxy-Secret'] = PROXY_SECRET;
  try {
    const fetch = (await import('node-fetch')).default;
    const proxyRes = await fetch(`${FRONTEND_URL}/api/collages`, { method: 'GET', headers });
    const text = await proxyRes.text();
    try {
      res.status(proxyRes.status).json(JSON.parse(text));
    } catch {
      res.status(proxyRes.status).contentType(proxyRes.headers.get('content-type') || 'text/plain').send(text);
    }
  } catch (e) {
    console.error('[api/collages] GET proxy error:', e.message || e);
    res.status(502).json({ ok: false, error: 'Service unavailable' });
  }
}

const router = express.Router();
router.post('/', upload.single('file'), handlePost);
router.get('/', proxyGet);

module.exports = router;
