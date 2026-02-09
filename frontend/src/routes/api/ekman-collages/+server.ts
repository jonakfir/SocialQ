/**
 * GET /api/ekman-collages?userEmail=...&friendEmails=...
 * Returns user + friends collages in ekman format ({ img, label, difficulty }) for the backend to merge into /ekman.
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

function collagesToEkmanFormat(collages: { imageUrl: string; emotions: string | null }[], difficulty: string) {
  const out: Array<{ img: string; label: string; difficulty: string }> = [];
  for (const collage of collages) {
    if (!collage.emotions) continue;
    try {
      const emotions = JSON.parse(collage.emotions);
      if (Array.isArray(emotions) && emotions.length > 0) {
        const emotion = emotions[0];
        const ekmanEmotion = EMOTION_MAP[emotion] || emotion;
        if (EMOTIONS.includes(ekmanEmotion)) {
          out.push({ img: collage.imageUrl, label: ekmanEmotion, difficulty });
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export const GET: RequestHandler = async (event) => {
  if (!checkProxySecret(event.request)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userEmail = (event.url.searchParams.get('userEmail') || '').trim().toLowerCase();
  const friendEmailsParam = (event.url.searchParams.get('friendEmails') || '').trim();
  const friendEmails = friendEmailsParam ? friendEmailsParam.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : [];

  const allEmails = userEmail ? [userEmail, ...friendEmails] : friendEmails;
  if (allEmails.length === 0) {
    return json({ ok: true, images: [] });
  }

  try {
    const users = await prisma.user.findMany({
      where: allEmails.length > 0 ? { OR: allEmails.map((e) => ({ username: { equals: e, mode: 'insensitive' } })) } : undefined,
      select: { id: true, username: true }
    });
    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) {
      return json({ ok: true, images: [] });
    }

    const collages = await prisma.collage.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, imageUrl: true, emotions: true }
    });

    const userSet = new Set(users.filter((u) => u.username.toLowerCase() === userEmail).map((u) => u.id));
    let images: Array<{ img: string; label: string; difficulty: string }> = [];

    for (const c of collages) {
      const difficulty = userSet.has(c.userId) ? 'user' : 'friend';
      const converted = collagesToEkmanFormat([{ imageUrl: c.imageUrl, emotions: c.emotions }], difficulty);
      images = images.concat(converted);
    }

    return json({ ok: true, images });
  } catch (e: any) {
    console.error('[ekman-collages]', e);
    return json({ ok: false, error: e?.message || 'Failed' }, { status: 500 });
  }
};
