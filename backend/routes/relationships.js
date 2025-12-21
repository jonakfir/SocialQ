// backend/routes/relationships.js
const express = require('express');
const {
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  getFriendships,
  getFriendRequests,
  findUserByEmail,
  findUserById
} = require('../db/db');

const router = express.Router();

// Helper to get current user ID from request
function getCurrentUserId(req) {
  const idFromUser = req.user?.id || req.session?.user?.id;
  if (idFromUser) return Number(idFromUser);
  const idFromCookie = Number(req.cookies?.uid) || Number(req.cookies?.userId) || null;
  return idFromCookie || null;
}

// Helper to require authentication
function requireAuth(req, res, next) {
  const userId = getCurrentUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.currentUserId = userId;
  next();
}

// POST /relationships/requests - Send a friend request
router.post('/requests', requireAuth, async (req, res) => {
  try {
    const fromUserId = req.currentUserId;
    const { userEmail } = req.body;

    if (!userEmail || typeof userEmail !== 'string') {
      return res.status(400).json({ error: 'User email is required' });
    }

    // Find target user
    const targetUser = await findUserByEmail(userEmail);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const toUserId = targetUser.id;

    // Can't send request to yourself
    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists
    const { findFriendshipByUsers } = require('../db/db');
    const existingFriendship = await findFriendshipByUsers(fromUserId, toUserId);
    if (existingFriendship) {
      return res.status(409).json({ error: 'Friendship already exists' });
    }

    // Create friend request
    const request = await createFriendRequest({ fromUserId, toUserId });
    
    if (!request) {
      return res.status(409).json({ error: 'Friend request already exists or was previously sent' });
    }

    return res.status(201).json({ ok: true, request });
  } catch (e) {
    console.error('[POST /relationships/requests] error:', e);
    return res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// GET /relationships/requests - Get friend requests (sent and received)
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const requests = await getFriendRequests(userId);
    return res.json({ ok: true, ...requests });
  } catch (e) {
    console.error('[GET /relationships/requests] error:', e);
    return res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// POST /relationships/requests/:id/accept - Accept a friend request
router.post('/requests/:id/accept', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const requestId = parseInt(req.params.id, 10);

    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    // Get the request to verify it's for the current user
    const { findFriendRequestById } = require('../db/db');
    const request = await findFriendRequestById(requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Verify the request is for the current user
    if (request.to_user_id !== userId) {
      return res.status(403).json({ error: 'You can only accept requests sent to you' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const friendship = await acceptFriendRequest({ requestId });
    
    if (!friendship) {
      return res.status(500).json({ error: 'Failed to create friendship' });
    }

    return res.json({ ok: true, friendship });
  } catch (e) {
    console.error('[POST /relationships/requests/:id/accept] error:', e);
    return res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// POST /relationships/requests/:id/decline - Decline a friend request
router.post('/requests/:id/decline', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const requestId = parseInt(req.params.id, 10);

    if (isNaN(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    // Get the request to verify it's for the current user
    const { findFriendRequestById } = require('../db/db');
    const request = await findFriendRequestById(requestId);
    
    if (!request) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Verify the request is for the current user
    if (request.to_user_id !== userId) {
      return res.status(403).json({ error: 'You can only decline requests sent to you' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const declinedRequest = await declineFriendRequest({ requestId });
    
    if (!declinedRequest) {
      return res.status(500).json({ error: 'Failed to decline friend request' });
    }

    return res.json({ ok: true, request: declinedRequest });
  } catch (e) {
    console.error('[POST /relationships/requests/:id/decline] error:', e);
    return res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// GET /relationships/friends - Get all friendships for current user
router.get('/friends', requireAuth, async (req, res) => {
  try {
    const userId = req.currentUserId;
    const friendships = await getFriendships(userId);
    return res.json({ ok: true, friendships });
  } catch (e) {
    console.error('[GET /relationships/friends] error:', e);
    return res.status(500).json({ error: 'Failed to fetch friendships' });
  }
});

module.exports = router;




