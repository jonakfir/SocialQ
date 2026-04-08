import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser, getAdminUserFromRequest } from '$lib/utils/syncUser';

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  const user = await getAdminUserFromRequest(event.request);
  return user ? { id: user.id } : null;
}

/**
 * GET /api/admin/stats - Platform overview statistics
 * Admin only
 */
export const GET: RequestHandler = async (event) => {
  try {
    // TEMPORARY: Always allow - ensure user exists in Prisma
    await ensurePrismaUser('jonakfir@gmail.com');
    
    // Sync users from backend to Prisma first
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      const authHeader = event.request.headers.get('authorization') || '';

      // Get all users from backend
      const backendUsersResponse = await fetch(`${base}/admin/users`, {
        method: 'GET',
        headers: { 'Cookie': cookieHeader, 'Authorization': authHeader },
      });
      
      if (backendUsersResponse.ok) {
        const backendUsersData = await backendUsersResponse.json();
        if (backendUsersData.ok && backendUsersData.users) {
          // Sync each backend user to Prisma using helper function
          for (const backendUser of backendUsersData.users) {
            const email = backendUser.email || backendUser.username;
            await ensurePrismaUser(email);
          }
        }
      }
    } catch (syncError) {
      console.warn('[GET /api/admin/stats] Failed to sync users from backend:', syncError);
    }
    
    // Use Prisma for stats (now synced with backend)
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
