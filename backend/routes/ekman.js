// GET /ekman?difficulty=1|2|3|4|all&count=8
// Returns Ekman quiz questions from the database (same format as SvelteKit /ekman).
// Used by the iOS app when API_BASE_URL points to Railway.

const express = require('express');
const router = express.Router();

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

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

    const dbModule = require('../db/db');
    const { pool } = dbModule;

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
      // Mirroring: ?ekmanOnly=1 = only images from web app assets/ekman folder (folder = 'canonical')
      const q = req.query || {};
      const ekmanOnly = String(q.ekmanOnly ?? q.photoType ?? '').toLowerCase() === '1' || String(q.photoType ?? '').toLowerCase() === 'ekman';

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

    const pool2 = rows
      .map((r) => ({
        img: r.imageData,
        label: r.label,
        difficulty: r.difficulty
      }))
      .filter((r) => EMOTIONS.includes(r.label));

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
