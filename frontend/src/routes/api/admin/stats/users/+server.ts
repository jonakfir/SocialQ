import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
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
 * GET /api/admin/stats/users - List all users with summary statistics
 * Admin only, paginated
 */
export const GET: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    const url = new URL(event.request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    
    // Build where clause
    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { id: { contains: search } }
      ];
    }
    
    // Add date filters
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Include the entire day
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }
    
    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              gameSessions: true
            }
          },
          organizationsCreated: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);
    
    // Get aggregated stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const sessions = await prisma.gameSession.findMany({
          where: { userId: user.id },
          select: {
            gameType: true,
            score: true,
            total: true
          }
        });
        
        const gameTypeStats: Record<string, { count: number; avgScore: number; totalQuestions: number }> = {};
        
        sessions.forEach((session) => {
          if (!gameTypeStats[session.gameType]) {
            gameTypeStats[session.gameType] = { count: 0, avgScore: 0, totalQuestions: 0 };
          }
          gameTypeStats[session.gameType].count++;
          gameTypeStats[session.gameType].avgScore += session.total > 0 ? (session.score / session.total) * 100 : 0;
          gameTypeStats[session.gameType].totalQuestions += session.total;
        });
        
        // Calculate averages
        Object.keys(gameTypeStats).forEach((gameType) => {
          const stats = gameTypeStats[gameType];
          stats.avgScore = stats.count > 0 ? stats.avgScore / stats.count : 0;
        });
        
        // Get member counts for organizations created by this user
        const orgsWithCounts = await Promise.all(
          (user.organizationsCreated || []).map(async (org: any) => {
            const memberCount = await prisma.organizationMembership.count({
              where: {
                organizationId: org.id,
                status: 'approved'
              }
            });
            return { ...org, memberCount };
          })
        );
        
        return {
          ...user,
          organizationsCreated: orgsWithCounts,
          stats: {
            totalSessions: sessions.length,
            gameTypeStats
          }
        };
      })
    );
    
    return json({
      ok: true,
      users: usersWithStats,
      total,
      limit,
      offset
    });
  } catch (error: any) {
    console.error('[GET /api/admin/stats/users] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
};
