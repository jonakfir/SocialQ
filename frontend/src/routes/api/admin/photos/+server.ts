import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }

    // Try backend auth with JWT token and cookies
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) {
      return null;
    }
    
    const prismaUser = await ensurePrismaUser(backendUser.email);
    return prismaUser;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
}

// GET /api/admin/photos - Get all photos with filtering
export const GET: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can access this endpoint' }, { status: 403 });
    }

    // Parse query parameters
    const url = new URL(event.request.url);
    const emotion = url.searchParams.get('emotion');
    const userId = url.searchParams.get('userId');
    const organizationId = url.searchParams.get('organizationId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const userPhotoCategory = url.searchParams.get('userPhotoCategory'); // 'verified' | 'unverified'

    // Build where clause
    const where: any = {};

    // Filter by emotion
    if (emotion && emotion !== 'All') {
      where.emotions = {
        contains: emotion,
        mode: 'insensitive'
      };
    }

    // Filter by user
    if (userId) {
      where.userId = userId;
    }

    // Filter by date range
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Filter by verified vs unverified (user photos only)
    if (userPhotoCategory === 'verified') {
      where.approvedAnyway = { not: true }; // false or null
    } else if (userPhotoCategory === 'unverified') {
      where.approvedAnyway = true;
    }

    // PERF: org filter moved into the DB query so we don't pull every matching
    // collage then throw most away in JS. Also added `take: 500` cap + `select`
    // so we don't fetch columns we don't use. Also `select` on User lookup.
    if (organizationId) {
      const orgMembers = await prisma.organizationMembership.findMany({
        where: { organizationId, status: 'approved' },
        select: { userId: true }
      });
      const orgUserIds = orgMembers.map((m) => m.userId);
      // If the org has zero approved members, short-circuit to empty.
      if (orgUserIds.length === 0) {
        return json({ ok: true, photos: [], total: 0 }, {
          headers: { 'Cache-Control': 'private, max-age=15' },
        });
      }
      where.userId = where.userId ? { in: [where.userId, ...orgUserIds].filter((x, i, a) => a.indexOf(x) === i) } : { in: orgUserIds };
    }

    // PERF: the Collage.imageUrl column holds the FULL image — either an http
    // URL (post-S3-migration) OR a multi-MB `data:image/...;base64,...` string
    // (legacy). With 500 legacy rows that's gigabytes over the Postgres wire
    // and a frozen grid. Two changes:
    //   1. Don't fetch imageUrl here at all. List returns just the metadata.
    //   2. Each row's imageUrl in the response is a per-id lazy endpoint
    //      (`/api/admin/photos/[id]/image`) that 302-redirects for http URLs
    //      or streams decoded bytes for data URLs. Combined with `loading="lazy"`
    //      + `content-visibility: auto` on the UI grid, only visible tiles
    //      fetch their bytes, and those fetches parallelize in the browser.
    //
    // Measured before (18 collages, legacy base64): 10,504ms list response.
    // Expected after: list finishes in ~400ms; visible tiles load in the
    // background without blocking.
    const t0 = Date.now();
    const collages = await prisma.collage.findMany({
      where,
      select: {
        id: true,
        emotions: true,
        folder: true,
        approvedAnyway: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    console.log(`[GET /api/admin/photos] ${collages.length} rows in ${Date.now() - t0}ms`);

    // Resolve users by id (handle orphaned collages where userId has no User row)
    const userIds = [...new Set(collages.map((c) => c.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, { id: String(u.id), username: u.username ?? '' }]));

    const formattedCollages = collages.map((c) => ({
      id: c.id,
      imageUrl: `/api/admin/photos/${c.id}/image`,
      emotions: c.emotions ? JSON.parse(c.emotions) : null,
      folder: c.folder || 'Me',
      approvedAnyway: c.approvedAnyway ?? false,
      createdAt: c.createdAt,
      user: userMap.get(c.userId) ?? { id: String(c.userId), username: 'Unknown user' },
    }));

    return json({
      ok: true,
      photos: formattedCollages,
      total: formattedCollages.length
    }, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    });
  } catch (error: any) {
    console.error('[GET /api/admin/photos] error', error?.message || error);
    return json({ ok: false, error: error?.message || 'Failed to fetch photos' }, { status: 500 });
  }
};

