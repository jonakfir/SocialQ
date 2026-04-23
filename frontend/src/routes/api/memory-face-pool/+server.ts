/**
 * Memory game face pool — served by a dedicated API route so the /memory
 * page navigation is instant. The server-side +page load used to block on
 * a 500-row RDS query (~1–3s over network to AWS), making the transition
 * from Dashboard → Good with Faces feel broken.
 *
 * This endpoint returns the same pool the old loader produced, but is
 * called client-side (non-blocking) AFTER the lobby renders. A 5-minute
 * in-memory cache keeps warm instances at <10ms.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

const EKMAN_TO_EMOTION: Record<string, string> = {
  Happy:    'happy',
  Anger:    'angry',
  Sad:      'sad',
  Fear:     'fearful',
  Disgust:  'disgusted',
  Surprise: 'surprised',
};

type PoolCacheEntry = { pool: Record<string, string[]>; expiresAt: number };
let poolCache: PoolCacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000;

const buildPool = (rows: Array<{ imageUrl: string | null; label: string }>) => {
  const pool: Record<string, string[]> = {};
  for (const row of rows) {
    const emotionId = EKMAN_TO_EMOTION[row.label];
    if (!emotionId || !row.imageUrl) continue;
    if (!pool[emotionId]) pool[emotionId] = [];
    if (pool[emotionId].length < 12) pool[emotionId].push(row.imageUrl);
  }
  return pool;
};

const viable = (p: Record<string, string[]>) =>
  Object.values(p).filter((a) => a.length >= 2).length;

export const GET: RequestHandler = async () => {
  if (poolCache && poolCache.expiresAt > Date.now()) {
    return json({ facePool: poolCache.pool, cached: true });
  }

  try {
    const generated = await prisma.ekmanImage.findMany({
      where: {
        AND: [
          { imageUrl: { not: null } },
          {
            OR: [
              { folder: { startsWith: 'Generated Photos/' } },
              { photoType: 'synthetic' },
            ],
          },
        ],
      },
      select: { imageUrl: true, label: true },
      take: 500,
    });

    let facePool = buildPool(generated);

    if (viable(facePool) < 4) {
      const stock = await prisma.ekmanImage.findMany({
        where: {
          label: { in: Object.keys(EKMAN_TO_EMOTION) },
          imageUrl: { not: null },
        },
        select: { imageUrl: true, label: true },
        take: 300,
      });
      facePool = buildPool(stock);
    }

    if (viable(facePool) >= 4) {
      poolCache = { pool: facePool, expiresAt: Date.now() + TTL_MS };
      return json({ facePool, cached: false });
    }

    return json({ facePool: {}, cached: false });
  } catch (e) {
    console.error('[api/memory-face-pool] DB fetch failed:', (e as Error)?.message);
    return json({ facePool: {}, cached: false });
  }
};
