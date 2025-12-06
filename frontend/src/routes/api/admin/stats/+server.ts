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
    
    // Find or create Prisma user by email and check role
    const email = backendUser.email || backendUser.username;
    let prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true, role: true }
    });
    
    // If user doesn't exist in Prisma, create them (sync from backend)
    if (!prismaUser) {
      const bcrypt = await import('bcryptjs');
      const { generateUserId } = await import('$lib/userId');
      const { randomBytes } = await import('crypto');
      
      const userId = await generateUserId();
      const defaultPassword = await bcrypt.hash('temp', 10);
      
      // Generate unique invitation code
      let invitationCode: string;
      let attempts = 0;
      do {
        invitationCode = randomBytes(8).toString('hex').toUpperCase();
        attempts++;
        if (attempts > 10) break;
      } while (await prisma.user.findUnique({ where: { invitationCode } }));
      
      // Hardcode admin role for jonakfir@gmail.com
      const isAdmin = email === 'jonakfir@gmail.com';
      const role = isAdmin ? 'admin' : 'personal';
      
      prismaUser = await prisma.user.create({
        data: {
          id: userId,
          username: email,
          password: defaultPassword,
          role,
          invitationCode: invitationCode || undefined
        },
        select: { id: true, role: true }
      });
    }
    
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
    
    // Sync users from backend to Prisma first
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      // Get all users from backend
      const backendUsersResponse = await fetch(`${base}/admin/users`, {
        method: 'GET',
        headers: { 'Cookie': cookieHeader },
        credentials: 'include'
      });
      
      if (backendUsersResponse.ok) {
        const backendUsersData = await backendUsersResponse.json();
        if (backendUsersData.ok && backendUsersData.users) {
          // Sync each backend user to Prisma
          for (const backendUser of backendUsersData.users) {
            const email = backendUser.email || backendUser.username;
            const existingPrismaUser = await prisma.user.findFirst({
              where: { username: email }
            });
            
            if (!existingPrismaUser) {
              // Create Prisma user from backend user
              const bcrypt = await import('bcryptjs');
              const { generateUserId } = await import('$lib/userId');
              const { randomBytes } = await import('crypto');
              
              const userId = await generateUserId();
              const defaultPassword = await bcrypt.hash('temp', 10);
              
              // Generate unique invitation code
              let invitationCode: string;
              let attempts = 0;
              do {
                invitationCode = randomBytes(8).toString('hex').toUpperCase();
                attempts++;
                if (attempts > 10) break;
              } while (await prisma.user.findUnique({ where: { invitationCode } }));
              
              // Hardcode admin role for jonakfir@gmail.com
              const isAdmin = email === 'jonakfir@gmail.com';
              const role = isAdmin ? 'admin' : 'personal';
              
              await prisma.user.create({
                data: {
                  id: userId,
                  username: email,
                  password: defaultPassword,
                  role,
                  invitationCode: invitationCode || undefined
                }
              });
            }
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
