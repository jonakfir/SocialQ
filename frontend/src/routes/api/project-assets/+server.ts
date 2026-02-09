import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * GET /api/project-assets
 * List project art assets (no base64 data). Optional ?category=bub|faces|girl|characters|other
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const category = url.searchParams.get('category')?.trim() || undefined;
    const assets = await prisma.projectAsset.findMany({
      where: category ? { category } : undefined,
      select: { id: true, key: true, category: true, mimeType: true },
      orderBy: [{ category: 'asc' }, { key: 'asc' }]
    });
    return json({ assets });
  } catch (e: any) {
    console.error('[GET /api/project-assets]', e?.message || e);
    return json({ error: e?.message || 'Failed to list project assets' }, { status: 500 });
  }
};
