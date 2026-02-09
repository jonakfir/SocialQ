import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * GET /api/project-assets/[key]
 * Fetch one project art asset by key. Returns { key, category, mimeType, data }.
 * Use data as src for <img> or <video> (data URL).
 */
export const GET: RequestHandler = async ({ params }) => {
  const key = params.key?.trim();
  if (!key) {
    return json({ error: 'Key is required' }, { status: 400 });
  }
  try {
    const asset = await prisma.projectAsset.findUnique({
      where: { key }
    });
    if (!asset) {
      return json({ error: 'Asset not found' }, { status: 404 });
    }
    return json({
      key: asset.key,
      category: asset.category,
      mimeType: asset.mimeType,
      data: asset.data
    });
  } catch (e: any) {
    console.error('[GET /api/project-assets/[key]]', e?.message || e);
    return json({ error: e?.message || 'Failed to fetch asset' }, { status: 500 });
  }
};
