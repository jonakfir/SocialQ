// GET /api/friends/:friendId/photos - Friend's saved photos (iOS parity with web)
// When FRONTEND_URL + PROXY_SECRET are set, proxies to frontend for real collages.
const express = require('express');
const jwt = require('jsonwebtoken');
const { findFriendshipByUsers, findUserById } = require('../db/db');

const router = express.Router();
const JWT_SECRET = process.env.AUTH_SECRET || 'dev-change-this';
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.PUBLIC_WEB_APP_URL || '').replace(/\/$/, '');
const PROXY_SECRET = process.env.PROXY_SECRET || process.env.BACKEND_PROXY_SECRET || '';

function getCurrentUserId(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.uid) return Number(payload.uid);
    } catch { /* fall through */ }
  }
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);
  const idFromCookie = Number(req.cookies?.uid) || Number(req.cookies?.userId) || null;
  return idFromCookie || null;
}

function requireAuth(req, res, next) {
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  req.currentUserId = userId;
  next();
}

// GET /api/friends/:friendId/photos
router.get('/:friendId/photos', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.currentUserId;
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) {
      return res.status(400).json({ ok: false, error: 'Invalid friend ID' });
    }
    const friendship = await findFriendshipByUsers(currentUserId, friendId);
    if (!friendship) {
      return res.status(403).json({ ok: false, error: 'Friendship not found' });
    }
    // Proxy to frontend when configured so iOS gets real friend photos (Prisma/Collage)
    if (FRONTEND_URL && PROXY_SECRET) {
      try {
        const friendUser = await findUserById(friendId);
        const email = friendUser?.email?.trim();
        if (email) {
          const fetch = (await import('node-fetch')).default;
          const url = `${FRONTEND_URL}/api/friends/collages-by-email?email=${encodeURIComponent(email)}`;
          const proxyRes = await fetch(url, {
            headers: { 'X-Proxy-Secret': PROXY_SECRET }
          });
          if (proxyRes.ok) {
            const data = await proxyRes.json();
            return res.json({ ok: data.ok !== false, collages: data.collages || [] });
          }
        }
      } catch (proxyErr) {
        console.warn('[GET /api/friends/:friendId/photos] proxy failed:', proxyErr?.message || proxyErr);
      }
    }
    return res.json({ ok: true, collages: [] });
  } catch (e) {
    console.error('[GET /api/friends/:friendId/photos] error:', e);
    return res.status(500).json({ ok: false, error: 'Failed to fetch friend photos' });
  }
});

module.exports = router;
