// GET /ekman?difficulty=1|2|3|4|all&count=8
// Returns Ekman quiz questions from the database (same format as SvelteKit /ekman).
// When FRONTEND_URL + PROXY_SECRET are set and user is authenticated, merges in user + friends collages from frontend.

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.PUBLIC_WEB_APP_URL || '').replace(/\/$/, '');
const PROXY_SECRET = process.env.PROXY_SECRET || process.env.BACKEND_PROXY_SECRET || '';
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
  return Number(req.cookies?.uid) || Number(req.cookies?.userId) || null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.get('/', async (req, res) => {
  try {
    const diff = (req.query.difficulty ?? '1').toString();
    const count = Math.min(Number(req.query.count ?? '12') || 12, 50);
    const q = req.query || {};
    const photoTypeParam = String(q.photoType ?? '').trim().toLowerCase();
    const useGeneratedOnly = photoTypeParam === 'synthetic' || photoTypeParam === 'generated';
    const ekmanOnly = String(q.ekmanOnly ?? '').toLowerCase() === '1' || (photoTypeParam === 'ekman');

    // When photoType=synthetic, use ONLY generated photos from frontend DB — never fall back to local Ekman
    if (useGeneratedOnly) {
      if (FRONTEND_URL && PROXY_SECRET) {
        try {
          const fetch = (await import('node-fetch')).default;
          const params = new URLSearchParams();
          params.set('photoType', 'synthetic');
          params.set('difficulty', diff);
          params.set('count', String(count));
          const url = `${FRONTEND_URL}/api/ekman-quiz?${params.toString()}`;
          const proxyRes = await fetch(url, { headers: { 'X-Proxy-Secret': PROXY_SECRET } });
          if (proxyRes.ok) {
            const questions = await proxyRes.json();
            return res.json(Array.isArray(questions) ? questions : []);
          }
        } catch (err) {
          console.warn('[ekman] Generated-only proxy failed:', err?.message || err);
        }
      } else {
        console.warn('[ekman] photoType=synthetic requested but FRONTEND_URL or PROXY_SECRET not set; returning no images.');
      }
      return res.json([]);
    }

    const dbModule = require('../db/db');
    const { pool, getFriendships, findUserById } = dbModule;

    if (!pool) {
      console.warn('[ekman] No PostgreSQL pool - EkmanImage table lives in Prisma-managed DB');
      return res.json([]);
    }

    // EkmanImage table is created by Prisma/frontend migrations (may not exist on backend-only deploys)
    let rows = [];
    try {
      // Check if EkmanImage table exists first
      const tableExists = await pool
        .query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EkmanImage'`
        )
        .then((r) => r.rows.length > 0)
        .catch(() => false);

      if (!tableExists) {
        console.warn('[ekman] EkmanImage table does not exist - run frontend migrations or populate script');
        return res.json([]);
      }

      // Support both schemas (with/without photoType, folder columns)
      const hasPhotoType = await pool
        .query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'EkmanImage' AND column_name = 'photoType'`
        )
        .then((r) => r.rows.length > 0)
        .catch(() => false);
      const hasFolder = await pool
        .query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'EkmanImage' AND column_name = 'folder'`
        )
        .then((r) => r.rows.length > 0)
        .catch(() => false);

      const diffFilter = diff === 'all' ? 'true' : '"difficulty" = $1';
      const args = diff === 'all' ? [] : [diff];

      let sql;
      if (ekmanOnly && hasFolder) {
        sql = `SELECT "imageData", "label", "difficulty" FROM "EkmanImage"
               WHERE "folder" = 'canonical' AND (${diffFilter})`;
      } else if (hasPhotoType) {
        sql = `SELECT "imageData", "label", "difficulty" FROM "EkmanImage"
               WHERE "photoType" IN ('ekman', 'other') AND (${diffFilter})`;
      } else {
        sql = `SELECT "imageData", "label", "difficulty" FROM "EkmanImage" WHERE ${diffFilter}`;
      }

      const result = await pool.query(sql, args);
      rows = result.rows || [];
    } catch (err) {
      console.warn('[ekman] Query failed (EkmanImage table may not exist):', err.message);
      return res.json([]);
    }

    let pool2 = rows
      .map((r) => ({
        img: r.imageData,
        label: r.label,
        difficulty: r.difficulty
      }))
      .filter((r) => EMOTIONS.includes(r.label));

    // When not ekmanOnly, add user + friends collages from frontend (so iOS recognition includes them like web)
    if (!ekmanOnly && FRONTEND_URL && PROXY_SECRET && getFriendships && findUserById) {
      const currentUserId = getCurrentUserId(req);
      if (currentUserId) {
        try {
          const currentUser = await findUserById(currentUserId);
          const userEmail = currentUser?.email?.trim();
          const friendships = await getFriendships(currentUserId);
          const friendEmails = (friendships || [])
            .map((f) => f.friend_email)
            .filter(Boolean)
            .map((e) => String(e).trim())
            .filter((e) => e && e !== userEmail);
          const friendEmailsUniq = [...new Set(friendEmails)];
          if (userEmail || friendEmailsUniq.length > 0) {
            const fetch = (await import('node-fetch')).default;
            const params = new URLSearchParams();
            if (userEmail) params.set('userEmail', userEmail);
            if (friendEmailsUniq.length) params.set('friendEmails', friendEmailsUniq.join(','));
            const url = `${FRONTEND_URL}/api/ekman-collages?${params.toString()}`;
            const collagesRes = await fetch(url, { headers: { 'X-Proxy-Secret': PROXY_SECRET } });
            if (collagesRes.ok) {
              const data = await collagesRes.json();
              const extra = data.images || [];
              const valid = extra.filter((x) => x.img && x.label && EMOTIONS.includes(x.label));
              pool2 = pool2.concat(valid);
              if (valid.length) console.log('[ekman] Merged', valid.length, 'user/friend collage(s)');
            }
          }
        } catch (err) {
          console.warn('[ekman] Frontend collages merge failed:', err?.message || err);
        }
      }
    }

    if (pool2.length === 0) {
      return res.json([]);
    }

    shuffle(pool2);
    const picked = pool2.slice(0, Math.min(count, pool2.length));

    const questions = picked.map((p) => {
      const distractors = shuffle(EMOTIONS.filter((e) => e !== p.label)).slice(0, 3);
      const options = shuffle([p.label, ...distractors]);
      return { img: p.img, options, correct: p.label };
    });

    return res.json(questions);
  } catch (error) {
    console.error('[ekman] Error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to fetch images'
    });
  }
});

module.exports = router;
