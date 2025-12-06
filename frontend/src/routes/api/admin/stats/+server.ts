import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    // Check for mock auth header (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      if (user && user.role === 'admin') return { id: user.id };
      return null;
    }
    
    // Try real backend auth
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader },
      credentials: 'include'
    });
    
    const data = await response.json();
    const backendUser = data?.user;
    
    if (!backendUser || !backendUser.id) {
      return null;
    }
    
    // Find Prisma user by email and check role
    const email = backendUser.email || backendUser.username;
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true, role: true }
    });
    
    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/stats - Platform overview statistics
 * Admin only
 */
export const GET: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    // Fetch stats from backend (which uses PostgreSQL)
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    try {
      const backendResponse = await fetch(`${base}/admin/stats`, {
        method: 'GET',
        headers: { 'Cookie': cookieHeader },
        credentials: 'include'
      });
      
      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        if (backendData.ok) {
          return json(backendData);
        }
      }
    } catch (e) {
      console.error('[GET /api/admin/stats] Backend fetch failed, falling back to Prisma:', e);
    }
    
    // Fallback to Prisma if backend fails
    const [totalUsers, totalSessions, todaySessions, adminCount] = await Promise.all([
      prisma.user.count(),
      prisma.gameSession.count(),
      prisma.gameSession.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.user.count({ where: { role: 'admin' } })
    ]);
    
    // Get unique active users today
    const todayActiveUsers = await prisma.gameSession.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });
    
    return json({
      ok: true,
      stats: {
        totalUsers,
        totalSessions,
        todaySessions,
        todayActiveUsers: todayActiveUsers.length,
        adminCount
      }
    });
  } catch (error: any) {
    console.error('[GET /api/admin/stats/overview] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch overview stats' },
      { status: 500 }
    );
  }
};
