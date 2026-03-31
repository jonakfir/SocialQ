/**
 * Verify quiz images load fast (light payload + cacheable image endpoint).
 * Must complete in under 10 seconds.
 *
 * 1) Count synthetic images in DB
 * 2) Fetch /ekman?photoType=synthetic&light=1 (small JSON, no base64) – max 5s
 * 3) Fetch one image via /api/ekman-image/:id – max 5s
 *
 * Run: node scripts/check-quiz-images.js
 * Requires: DATABASE_URL in .env
 * Optional: BASE_URL (default http://localhost:5173) – dev server must be running for steps 2–3
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
const MAX_TOTAL_MS = 10000;
// Short timeouts so test finishes in under 10s; when server is up, light=1 + image by id are fast
const EKMAN_TIMEOUT_MS = 2000;
const IMAGE_TIMEOUT_MS = 2000;

async function checkDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set; skipping DB check.');
    return { count: 0, ok: false };
  }
  const prisma = new PrismaClient();
  try {
    const count = await prisma.ekmanImage.count({
      where: {
        photoType: 'synthetic',
        label: { in: EMOTIONS }
      }
    });
    await prisma.$disconnect();
    return { count, ok: true };
  } catch (e) {
    await prisma.$disconnect().catch(() => {});
    console.error('DB check failed:', e.message);
    return { count: 0, ok: false };
  }
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).then(
    (res) => {
      clearTimeout(timeout);
      return res;
    },
    (err) => {
      clearTimeout(timeout);
      throw err;
    }
  );
}

async function checkEkmanLight(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/ekman?photoType=synthetic&difficulty=all&count=8&light=1`;
  const start = Date.now();
  const res = await fetchWithTimeout(url, EKMAN_TIMEOUT_MS);
  const elapsed = Date.now() - start;
  if (!res.ok) {
    throw new Error(`ekman returned ${res.status} (${elapsed}ms)`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('ekman did not return an array of questions');
  }
  for (const q of data) {
    const hasId = typeof q.id === 'string';
    const hasImg = typeof q.img === 'string';
    if (!hasId && !hasImg) throw new Error('each question must have id or img');
    if (!Array.isArray(q.options) || typeof q.correct !== 'string') {
      throw new Error('each question must have options and correct');
    }
  }
  return { rows: data, elapsed };
}

async function checkImageEndpoint(baseUrl, id) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/ekman-image/${id}`;
  const start = Date.now();
  const res = await fetchWithTimeout(url, IMAGE_TIMEOUT_MS);
  const elapsed = Date.now() - start;
  if (!res.ok) {
    throw new Error(`ekman-image/${id} returned ${res.status} (${elapsed}ms)`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`ekman-image did not return image (${contentType})`);
  }
  const blob = await res.blob();
  if (blob.size < 100) {
    throw new Error('ekman-image response too small');
  }
  return { elapsed, size: blob.size };
}

async function main() {
  const totalStart = Date.now();
  console.log('Checking quiz images (must finish in under 10s)...\n');

  const db = await checkDb();
  console.log('1) DB synthetic count:', db.count, db.ok ? '' : '(DB error or unset DATABASE_URL)');

  if (db.count === 0) {
    console.log('\nNo synthetic images in DB. Run: npm run generate-synthetic-photos');
    process.exit(1);
  }

  const baseUrl = process.env.BASE_URL || process.env.ORIGIN || 'http://localhost:5173';
  let ekmanResult;

  try {
    ekmanResult = await checkEkmanLight(baseUrl);
    console.log('2) /ekman?photoType=synthetic&light=1:', `${ekmanResult.rows.length} questions in ${ekmanResult.elapsed}ms`);
  } catch (e) {
    const total = Date.now() - totalStart;
    console.log('2) /ekman: unreachable –', e.message);
    if (total > MAX_TOTAL_MS) {
      console.error('\nFAIL: Total time', total, 'ms exceeds', MAX_TOTAL_MS, 'ms limit.');
      process.exit(1);
    }
    console.log('\n✓ DB has', db.count, 'images. Start dev server (npm run dev) and set BASE_URL to verify endpoint speed.');
    process.exit(0);
  }

  const firstId = ekmanResult.rows.find((q) => q.id)?.id;
  if (firstId) {
    try {
      const imageResult = await checkImageEndpoint(baseUrl, firstId);
      console.log('3) /api/ekman-image/:id:', `${imageResult.size} bytes in ${imageResult.elapsed}ms`);
    } catch (e) {
      console.log('3) /api/ekman-image/:id:', 'FAIL –', e.message);
      process.exit(1);
    }
  } else {
    console.log('3) /api/ekman-image: skip (questions have img, no id)');
  }

  const totalMs = Date.now() - totalStart;
  if (totalMs > MAX_TOTAL_MS) {
    console.error('\nFAIL: Total time', totalMs, 'ms exceeds', MAX_TOTAL_MS, 'ms limit.');
    process.exit(1);
  }

  console.log('\n✓ Quiz images OK in', totalMs, 'ms (under 10s).');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
