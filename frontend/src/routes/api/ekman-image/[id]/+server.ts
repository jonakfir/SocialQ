/**
 * GET /api/ekman-image/[id]
 * Returns a single Ekman image by ID with long cache so the quiz loads fast after first request.
 * Used when /ekman is called with light=1 (returns ids instead of base64).
 */
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
  const id = params?.id;
  if (!id) {
    return new Response('Not Found', { status: 404 });
  }
  try {
    const row = await prisma.ekmanImage.findUnique({
      where: { id },
      select: { imageData: true }
    });
    if (!row?.imageData) {
      return new Response('Not Found', { status: 404 });
    }
    const dataUrl = row.imageData;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return new Response('Invalid image data', { status: 500 });
    }
    const contentType = match[1].trim() || 'image/jpeg';
    const base64 = match[2];
    const binary = Buffer.from(base64, 'base64');
    return new Response(binary, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
};
