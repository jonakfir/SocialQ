import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';

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

/** Return empty user list so UI never gets 500; hint when DB failed. */
function emptyUserListResponse(url?: URL | null, dbError?: boolean): ReturnType<typeof json> {
  const limit = url ? Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100) : 50;
  const offset = url ? parseInt(url.searchParams.get('offset') || '0', 10) : 0;
  return json({
    ok: true,
    users: [],
    total: 0,
    limit,
    offset,
    ...(dbError && { _dbHint: 'Database not connected. On Vercel: set DATABASE_URL to Railway Postgres URL and add ?sslmode=require at the end. Redeploy after changing.' })
  });
}

/**
 * GET /api/admin/stats/users - List all users with summary statistics.
 * Never returns 500: any error returns 200 with empty users list.
 */
export const GET: RequestHandler = async (event) => {
  let url: URL;
  try {
    url = new URL(event.request.url);
  } catch {
    return emptyUserListResponse(null);
  }
  try {
    // Sync users from backend to Prisma first (same as dashboard stats) so list matches total
    try {
      await ensurePrismaUser('jonakfir@gmail.com');
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      const backendRes = await fetch(`${base}/admin/users`, {
        method: 'GET',
        headers: { Cookie: cookieHeader },
        credentials: 'include'
      });
      if (backendRes.ok) {
        const backendData = await backendRes.json();
        if (backendData.ok && backendData.users) {
          for (const u of backendData.users) {
            const email = u.email || u.username;
            if (email) await ensurePrismaUser(email);
          }
        }
      }
    } catch (syncErr) {
      console.warn('[GET /api/admin/stats/users] Sync from backend failed:', syncErr);
    }

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    
    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { id: { contains: search } }
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }
    
    let users: Awaited<ReturnType<typeof prisma.user.findMany>>;
    let total: number;
    try {
      [users, total] = await Promise.all([
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
            _count: { select: { gameSessions: true } }
          }
        }),
        prisma.user.count({ where })
      ]);
    } catch (dbErr: any) {
      console.error('[GET /api/admin/stats/users] Prisma/DB error:', dbErr?.message ?? dbErr);
      return emptyUserListResponse(url);
    }

    const organizationsCreatedByUser = new Map<string, Array<{ id: string; name: string; status: string; memberCount: number }>>();
    
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        let sessions: Array<{ gameType: string; score: number; total: number }> = [];
        try {
          sessions = await prisma.gameSession.findMany({
            where: { userId: user.id },
            select: { gameType: true, score: true, total: true }
          });
        } catch {
          // skip per-user session load on error
        }
        const gameTypeStats: Record<string, { count: number; avgScore: number; totalQuestions: number }> = {};
        sessions.forEach((session) => {
          if (!gameTypeStats[session.gameType]) {
            gameTypeStats[session.gameType] = { count: 0, avgScore: 0, totalQuestions: 0 };
          }
          gameTypeStats[session.gameType].count++;
          gameTypeStats[session.gameType].avgScore += session.total > 0 ? (session.score / session.total) * 100 : 0;
          gameTypeStats[session.gameType].totalQuestions += session.total;
        });
        Object.keys(gameTypeStats).forEach((gameType) => {
          const stats = gameTypeStats[gameType];
          stats.avgScore = stats.count > 0 ? stats.avgScore / stats.count : 0;
        });
        return {
          ...user,
          organizationsCreated: organizationsCreatedByUser.get(user.id) ?? [],
          stats: { totalSessions: sessions.length, gameTypeStats }
        };
      })
    );

    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      const backendRes = await fetch(`${base}/admin/users`, {
        method: 'GET',
        headers: { Cookie: cookieHeader },
        credentials: 'include'
      });
      if (backendRes.ok) {
        const backendData = await backendRes.json();
        const backendUsers = (backendData.users || []) as Array<{ id: number; email?: string; username?: string; role?: string; accessLevel?: string; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; trialEndsAt?: string | null }>;
        const byEmail = new Map<string, (typeof backendUsers)[0]>();
        backendUsers.forEach((u) => {
          const email = (u.email || u.username || '').toLowerCase().trim();
          if (email) byEmail.set(email, u);
        });
        usersWithStats.forEach((u: any) => {
          const backend = byEmail.get((u.username || '').toLowerCase().trim());
          if (backend) {
            u.backendId = backend.id;
            u.role = backend.role ?? u.role;
            u.accessLevel = backend.accessLevel ?? 'none';
            u.stripeCustomerId = backend.stripeCustomerId ?? null;
            u.stripeSubscriptionId = backend.stripeSubscriptionId ?? null;
            u.trialEndsAt = backend.trialEndsAt ?? null;
          } else {
            u.accessLevel = u.accessLevel ?? 'none';
          }
        });
      }
    } catch (_) {
      usersWithStats.forEach((u: any) => { u.accessLevel = u.accessLevel ?? 'none'; });
    }
    
    return json({
      ok: true,
      users: usersWithStats,
      total,
      limit,
      offset,
      ...(total === 0 && { _dbHint: 'No users in database. On Vercel set DATABASE_URL to Railway Postgres URL and add ?sslmode=require at the end. See VERCEL_DATABASE.md' })
    });
  } catch (error: any) {
    console.error('[GET /api/admin/stats/users] error:', error);
    return emptyUserListResponse(url, true);
  }
};
