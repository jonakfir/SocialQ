import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser, getAdminUserFromRequest } from '$lib/utils/syncUser';

// Module-level cache: admin/stats runs a full backend→Prisma user sync on each
// request. Skip it when it ran recently — a 60s TTL is short enough that
// newly-created users show up on next refresh, long enough that opening the
// admin Dashboard feels instant.
let lastUserSyncAt = 0;
const USER_SYNC_TTL_MS = 60_000;

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    // Check for mock auth header (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    if (mockUserId && mockUserEmail) {
      const email = mockUserEmail.trim().toLowerCase();
      // HARDCODE: jonakfir@gmail.com is ALWAYS admin
      if (email === 'jonakfir@gmail.com') {
        const user = await ensurePrismaUser(email);
        return user ? { id: String(user.id) } : null;
      }
      const user = await prisma.user.findFirst({
        where: { username: email },
        select: { id: true, role: true }
      });
      if (user && user.role === 'admin') return { id: String(user.id) };
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
    
    // HARDCODE: jonakfir@gmail.com is ALWAYS admin - bypass all checks
    const email = (backendUser.email || backendUser.username || '').trim().toLowerCase();
    if (email === 'jonakfir@gmail.com') {
      const user = await ensurePrismaUser(email);
      return user ? { id: String(user.id) } : null;
    }
    
    // For other users, check Prisma role
    const prismaUser = await ensurePrismaUser(email);
    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch (error) {
    console.error('[getCurrentAdmin] Error:', error);
    // If everything fails but email is jonakfir@gmail.com, still allow
    try {
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
      const email = (backendUser?.email || backendUser?.username || '').trim().toLowerCase();
      if (email === 'jonakfir@gmail.com') {
        return { id: 'admin-override' }; // Temporary ID for hardcoded admin
      }
    } catch {}
    return null;
  }
}

/**
 * GET /api/admin/stats - Platform overview statistics
 * Admin only
 */
export const GET: RequestHandler = async (event) => {
  try {
    const admin = await getAdminUserFromRequest(event.request);
    if (!admin || admin.role !== 'admin') {
      return json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }
    
    // Sync users from backend to Prisma. Two changes from the old code:
    //   1. Cache — this endpoint is hit every time the admin navigates to
    //      /admin, and a full sync isn't needed that often. Skip if the
    //      previous sync was within the TTL (set on the module below).
    //   2. Parallel — when a sync DOES run, fire every ensurePrismaUser()
    //      in parallel via Promise.all instead of sequentially. The old
    //      loop was paying N * RTT (≥10s for ~50 users over AWS RDS), which
    //      made the admin Dashboard link feel dead.
    if (Date.now() - lastUserSyncAt > USER_SYNC_TTL_MS) {
      try {
        const { PUBLIC_API_URL } = await import('$env/static/public');
        const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
        const cookieHeader = event.request.headers.get('cookie') || '';

        const backendUsersResponse = await fetch(`${base}/admin/users`, {
          method: 'GET',
          headers: { 'Cookie': cookieHeader },
          credentials: 'include'
        });

        if (backendUsersResponse.ok) {
          const backendUsersData = await backendUsersResponse.json();
          if (backendUsersData.ok && Array.isArray(backendUsersData.users)) {
            const t0 = Date.now();
            await Promise.all(
              backendUsersData.users.map((u: { email?: string; username?: string }) => {
                const email = u.email || u.username;
                return email ? ensurePrismaUser(email).catch(() => null) : null;
              })
            );
            lastUserSyncAt = Date.now();
            console.log(`[admin/stats] user sync: ${backendUsersData.users.length} users in ${Date.now() - t0}ms`);
          }
        }
      } catch (syncError) {
        console.warn('[GET /api/admin/stats] Failed to sync users from backend:', syncError);
      }
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
