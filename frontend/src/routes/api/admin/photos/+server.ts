import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
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

    // Filter by user (userId is Int in Prisma schema)
    if (userId) {
      const userIdNum = parseInt(userId, 10);
      if (!isNaN(userIdNum)) {
        where.userId = userIdNum;
      }
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

    // Fetch collages without include so we don't fail when userId has no matching User (orphaned/mismatched ids)
    let collages = await prisma.collage.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    // Filter by organization if specified
    if (organizationId) {
      const orgMembers = await prisma.organizationMembership.findMany({
        where: {
          organizationId: organizationId,
          status: 'approved'
        },
        select: { userId: true }
      });
      const orgUserIds = new Set(orgMembers.map(m => m.userId));
      collages = collages.filter(c => orgUserIds.has(c.userId));
    }

    // Resolve users by id (handle orphaned collages where userId has no User row)
    const userIds = [...new Set(collages.map(c => c.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true }
    });
    const userMap = new Map(users.map(u => [u.id, { id: String(u.id), username: u.username ?? '' }]));

    const formattedCollages = collages.map(c => {
      const user = userMap.get(c.userId);
      return {
        id: c.id,
        imageUrl: c.imageUrl,
        emotions: c.emotions ? JSON.parse(c.emotions) : null,
        folder: c.folder || 'Me',
        approvedAnyway: c.approvedAnyway ?? false,
        createdAt: c.createdAt,
        user: user ?? { id: String(c.userId), username: 'Unknown user' }
      };
    });

    return json({
      ok: true,
      photos: formattedCollages,
      total: formattedCollages.length
    });
  } catch (error: any) {
    console.error('[GET /api/admin/photos] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch photos' }, { status: 500 });
  }
};

