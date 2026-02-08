// GET /api/friends/:friendId/photos - Friend's saved photos (iOS parity with web)
// Backend has no collage storage; returns empty list so the app doesn't 404.
const express = require('express');
const jwt = require('jsonwebtoken');
const { findFriendshipByUsers } = require('../db/db');

const router = express.Router();
const JWT_SECRET = process.env.AUTH_SECRET || 'dev-change-this';

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
    // Backend has no collage storage; return same shape as web so iOS is happy.
    return res.json({ ok: true, collages: [] });
  } catch (e) {
    console.error('[GET /api/friends/:friendId/photos] error:', e);
    return res.status(500).json({ ok: false, error: 'Failed to fetch friend photos' });
  }
});

module.exports = router;
