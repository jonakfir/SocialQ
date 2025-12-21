import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    // Check for mock auth headers first (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user || null;
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
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, username: true } });
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

    // Fetch all collages with user info
    let collages = await prisma.collage.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Filter by organization if specified
    if (organizationId) {
      // Get all users in the organization
      const orgMembers = await prisma.organizationMembership.findMany({
        where: {
          organizationId: organizationId,
          status: 'approved'
        },
        select: {
          userId: true
        }
      });
      const orgUserIds = new Set(orgMembers.map(m => m.userId));
      collages = collages.filter(c => orgUserIds.has(c.userId));
    }

    // Format response
    const formattedCollages = collages.map(c => ({
      id: c.id,
      imageUrl: c.imageUrl,
      emotions: c.emotions ? JSON.parse(c.emotions) : null,
      folder: c.folder || 'Me',
      createdAt: c.createdAt,
      user: {
        id: c.user.id,
        username: c.user.username
      }
    }));

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

