// GET /api/friends/:friendId/photos - Friend's saved photos (iOS parity with web)
// When FRONTEND_URL + PROXY_SECRET are set, proxies to frontend for real collages.
const express = require('express');
const jwt = require('jsonwebtoken');
const { findFriendshipByUsers, findUserById, findUserByEmail } = require('../db/db');

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

async function proxyCollagesByEmail(email, res) {
  if (!FRONTEND_URL || !PROXY_SECRET) {
    if (!FRONTEND_URL) console.warn('[friend-photos] FRONTEND_URL not set; set it on Railway to load friend photos from the web app.');
    return null;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const url = `${FRONTEND_URL}/api/friends/collages-by-email?email=${encodeURIComponent(email)}`;
    const proxyRes = await fetch(url, {
      headers: { 'X-Proxy-Secret': PROXY_SECRET }
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      return res.json({ ok: data.ok !== false, collages: data.collages || [] });
    }
    console.warn('[friend-photos] Frontend returned', proxyRes.status, 'for email', email);
    return null;
  } catch (err) {
    console.warn('[friend-photos] proxy failed:', err?.message || err);
    return null;
  }
}

// GET /api/friends/photos-by-email?email=...&friend_id=... — fallback when by-id returns empty. friend_id optional; when email not in backend, use friend_id to get canonical email.
router.get('/photos-by-email', requireAuth, async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'email required' });
    const friendIdParam = req.query.friend_id != null ? parseInt(String(req.query.friend_id), 10) : null;
    let friendUser = await findUserByEmail(email);
    if (!friendUser && !isNaN(friendIdParam)) {
      friendUser = await findUserById(friendIdParam);
    }
    if (!friendUser) return res.status(404).json({ ok: false, error: 'User not found' });
    const friendship = await findFriendshipByUsers(req.currentUserId, friendUser.id);
    if (!friendship) return res.status(403).json({ ok: false, error: 'Friendship not found' });
    const emailToProxy = (friendUser.email || email).trim().toLowerCase();
    const sent = await proxyCollagesByEmail(emailToProxy, res);
    if (sent) return;
    return res.json({ ok: true, collages: [] });
  } catch (e) {
    console.error('[GET /api/friends/photos-by-email] error:', e);
    return res.status(500).json({ ok: false, error: 'Failed to fetch friend photos' });
  }
});

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
    const friendUser = await findUserById(friendId);
    const email = friendUser?.email?.trim();
    if (email) {
      const sent = await proxyCollagesByEmail(email, res);
      if (sent) return;
    } else {
      console.warn('[friend-photos] No email for friendId', friendId, '; set FRONTEND_URL + PROXY_SECRET to load from web app.');
    }
    return res.json({ ok: true, collages: [] });
  } catch (e) {
    console.error('[GET /api/friends/:friendId/photos] error:', e);
    return res.status(500).json({ ok: false, error: 'Failed to fetch friend photos' });
  }
});

module.exports = router;
