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
      if (user && user.role === 'admin') return { id: String(user.id) };
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
    
    if (prismaUser && prismaUser.role === 'admin') return { id: String(prismaUser.id) };
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

// Module-level caches mirroring the ones in /api/admin/stats — admin/users is
// hit every time the admin lands on the Users tab, and the backend→Prisma
// sync doesn't need to run on every request. 60s TTL keeps fresh-enough
// visibility of new accounts without paying the network cost each navigation.
let lastUserSyncAt = 0;
const USER_SYNC_TTL_MS = 60_000;
// Cache the backend /admin/users payload across the sync and the merge below
// so we fetch it only once per request (the old code fetched it twice).
let backendUsersCache: { at: number; data: any } | null = null;
const BACKEND_USERS_TTL_MS = 30_000;

async function getBackendUsers(cookieHeader: string): Promise<any | null> {
  if (backendUsersCache && Date.now() - backendUsersCache.at < BACKEND_USERS_TTL_MS) {
    return backendUsersCache.data;
  }
  try {
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const res = await fetch(`${base}/admin/users`, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      credentials: 'include'
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.ok) {
      backendUsersCache = { at: Date.now(), data };
      return data;
    }
    return null;
  } catch {
    return null;
  }
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
  const cookieHeader = event.request.headers.get('cookie') || '';
  // Fetch the backend user list exactly once per request (cached across
  // the sync and the merge step at the bottom — the old code was calling
  // this twice, adding a full network round trip per navigation).
  const backendDataPromise = getBackendUsers(cookieHeader);

  try {
    // Sync users from backend to Prisma. Three changes from the old code:
    //   1. Parallel — ensurePrismaUser per-user is fired via Promise.all
    //      instead of a serial await loop. Over AWS RDS the serial loop
    //      was paying ~50ms × 120 users = ~6s per request.
    //   2. Cached — skip the entire sync when the previous one ran within
    //      the TTL. The Users tab no longer pays for the sync on rapid
    //      tab switches.
    //   3. Single fetch — reuses the backend response cached above.
    if (Date.now() - lastUserSyncAt > USER_SYNC_TTL_MS) {
      try {
        await ensurePrismaUser('jonakfir@gmail.com');
        const backendData = await backendDataPromise;
        if (backendData?.users && Array.isArray(backendData.users)) {
          await Promise.all(
            backendData.users.map((u: { email?: string; username?: string }) => {
              const email = u.email || u.username;
              return email ? ensurePrismaUser(email).catch(() => null) : null;
            })
          );
          lastUserSyncAt = Date.now();
        }
      } catch (syncErr) {
        console.warn('[GET /api/admin/stats/users] Sync from backend failed:', syncErr);
      }
    }

    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    
    const where: any = {};
    if (search) {
      const numericId = /^\d+$/.test(search) ? parseInt(search, 10) : null;
      if (numericId !== null) {
        where.id = numericId;
      } else {
        where.username = { contains: search };
      }
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
            createdAt: true
          }
        }),
        prisma.user.count({ where })
      ]);
    } catch (dbErr: any) {
      console.error('[GET /api/admin/stats/users] Prisma/DB error:', dbErr?.message ?? dbErr);
      return emptyUserListResponse(url);
    }

    // Single batched session query instead of N+1: old code fetched sessions
    // per-user in a Promise.all, which on the page-sized slice (50 users ×
    // ~50ms RDS round trip) added ~2.5s per request. Aggregate in memory
    // after one findMany keyed by userId IN (...).
    const userIds = users.map((u) => u.id);
    let sessionsByUser = new Map<string, Array<{ gameType: string; score: number; total: number }>>();
    if (userIds.length > 0) {
      try {
        const allSessions = await prisma.gameSession.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, gameType: true, score: true, total: true }
        });
        for (const s of allSessions) {
          const arr = sessionsByUser.get(s.userId) ?? [];
          arr.push({ gameType: s.gameType, score: s.score, total: s.total });
          sessionsByUser.set(s.userId, arr);
        }
      } catch (err) {
        console.warn('[GET /api/admin/stats/users] Batch session fetch failed:', err);
      }
    }

    const organizationsCreatedByUser = new Map<string, Array<{ id: string; name: string; status: string; memberCount: number }>>();

    const usersWithStats = users.map((user) => {
      const sessions = sessionsByUser.get(user.id) ?? [];
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
      } as any;
    });

    // Merge the backend fields (role, accessLevel, stripe ids, trialEndsAt).
    // Reuses the same backend fetch the sync step already kicked off above —
    // the cache dedupes this into a single network call per request.
    try {
      const backendData = await backendDataPromise;
      const backendUsers = (backendData?.users || []) as Array<{ id: number; email?: string; username?: string; role?: string; accessLevel?: string; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; trialEndsAt?: string | null }>;
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
