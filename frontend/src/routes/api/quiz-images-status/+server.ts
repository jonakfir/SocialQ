/**
 * GET /api/quiz-images-status
 * Debug endpoint: returns count of synthetic (generated) quiz images in the DB.
 * Use this to verify the frontend has images when the iOS app shows "No quiz images".
 * No auth required — only exposes a number.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

export const GET: RequestHandler = async () => {
  try {
    const count = await prisma.ekmanImage.count({
      where: {
        photoType: 'synthetic',
        label: { in: EMOTIONS }
      }
    });
    return json({
      ok: true,
      syntheticCount: count,
      hint: count === 0
        ? 'No generated photos in DB. Add images in Admin → All Photos → Generated Photos.'
        : 'Backend must proxy to this frontend with FRONTEND_URL + PROXY_SECRET. Check backend env and that BACKEND_PROXY_SECRET matches.'
    });
  } catch (e: any) {
    console.error('[quiz-images-status]', e);
    return json({ ok: false, error: e?.message || 'DB error', syntheticCount: 0 }, { status: 500 });
  }
};
