/**
 * GET /api/ekman-quiz?photoType=synthetic&difficulty=1|2|3|4|all&count=8
 * Returns quiz questions from EkmanImage (DB) for facial recognition quiz.
 * When photoType=synthetic, only "Generated Photos" (synthetic) images are returned.
 * Secured by X-Proxy-Secret so only the backend can call this.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { env } from '$env/dynamic/private';

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

function checkProxySecret(request: Request): boolean {
  const secret = env.BACKEND_PROXY_SECRET || '';
  const header = request.headers.get('X-Proxy-Secret') || '';
  return secret.length > 0 && header === secret;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const GET: RequestHandler = async (event) => {
  if (!checkProxySecret(event.request)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const photoType = (event.url.searchParams.get('photoType') || '').trim().toLowerCase();
  const difficulty = (event.url.searchParams.get('difficulty') || 'all').trim();
  const count = Math.min(Math.max(1, parseInt(event.url.searchParams.get('count') || '8', 10)), 50);

  // Only allow synthetic (generated photos) for quiz
  if (photoType !== 'synthetic') {
    return json({ ok: false, error: 'photoType=synthetic required' }, { status: 400 });
  }

  try {
    // Generated photos often have difficulty 'all'; include them for any requested difficulty
    const where: { photoType: string; label: { in: string[] }; difficulty?: object } = {
      photoType: 'synthetic',
      label: { in: EMOTIONS }
    };
    if (difficulty !== 'all' && ['1', '2', '3', '4'].includes(difficulty)) {
      where.difficulty = { in: [difficulty, 'all'] };
    }

    const rows = await prisma.ekmanImage.findMany({
      where,
      select: { imageData: true, label: true, difficulty: true }
    });

    const pool = rows
      .filter((r) => r.imageData && r.label && EMOTIONS.includes(r.label))
      .map((r) => ({ img: r.imageData, label: r.label, difficulty: r.difficulty }));

    if (pool.length === 0) {
      return json([]);
    }

    const shuffled = shuffle(pool);
    const picked = shuffled.slice(0, Math.min(count, shuffled.length));

    const questions = picked.map((p) => {
      const distractors = shuffle(EMOTIONS.filter((e) => e !== p.label)).slice(0, 3);
      const options = shuffle([p.label, ...distractors]);
      return { img: p.img, options, correct: p.label };
    });

    return json(questions);
  } catch (e: any) {
    console.error('[ekman-quiz]', e);
    return json({ ok: false, error: e?.message || 'Failed' }, { status: 500 });
  }
};
