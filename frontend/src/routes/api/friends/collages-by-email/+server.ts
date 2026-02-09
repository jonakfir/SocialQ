/**
 * GET /api/friends/collages-by-email?email=...
 * Used by the Node backend to fetch a friend's collages by email (backend has no Prisma/Collage).
 * Secured by X-Proxy-Secret so only the backend can call this.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { env } from '$env/dynamic/private';

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
const EMOTION_MAP: Record<string, string> = {
  Angry: 'Anger',
  Disgust: 'Disgust',
  Fear: 'Fear',
  Happy: 'Happy',
  Sad: 'Sad',
  Surprise: 'Surprise'
};

function checkProxySecret(request: Request): boolean {
  const secret = env.BACKEND_PROXY_SECRET || '';
  const header = request.headers.get('X-Proxy-Secret') || '';
  return secret.length > 0 && header === secret;
}

export const GET: RequestHandler = async (event) => {
  if (!checkProxySecret(event.request)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const email = (event.url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) {
    return json({ ok: false, error: 'email required' }, { status: 400 });
  }
  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: email, mode: 'insensitive' } },
      select: { id: true }
    });
    if (!user) {
      return json({ ok: true, collages: [] });
    }
    const collages = await prisma.collage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, imageUrl: true, emotions: true, createdAt: true }
    });
    return json({
      ok: true,
      collages: collages.map((c) => ({
        id: c.id,
        imageUrl: c.imageUrl,
        emotions: c.emotions ? JSON.parse(c.emotions) : null,
        createdAt: c.createdAt
      }))
    });
  } catch (e: any) {
    console.error('[collages-by-email]', e);
    return json({ ok: false, error: e?.message || 'Failed' }, { status: 500 });
  }
};
