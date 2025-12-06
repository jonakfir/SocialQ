import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current user
 */
async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      if (user) return { id: user.id, role: user.role || 'personal' };
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
    
    if (prismaUser) return { id: prismaUser.id, role: prismaUser.role || 'personal' };
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if user is org admin of a specific organization
 */
async function isOrgAdminOf(userId: string, organizationId: string): Promise<boolean> {
  try {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId,
        role: 'org_admin',
        status: 'approved'
      }
    });
    return !!membership;
  } catch {
    return false;
  }
}

/**
 * GET /api/admin/analytics - Comprehensive platform analytics
 * Admin only
 * Query params:
 *   - timeRange? (7d, 30d, 90d, all)
 *   - userId? (filter by specific user)
 *   - gameType? (facial_recognition, transition_recognition, mirroring)
 *   - difficulty? (easy, medium, hard, etc.)
 *   - dateFrom? (YYYY-MM-DD)
 *   - dateTo? (YYYY-MM-DD)
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const url = new URL(event.request.url);
    const timeRange = url.searchParams.get('timeRange') || '30d';
    const userId = url.searchParams.get('userId');
    const organizationId = url.searchParams.get('organizationId');
    const gameType = url.searchParams.get('gameType');
    const difficulty = url.searchParams.get('difficulty');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    
    // Authorization check:
    // - Master admins can access all analytics
    // - Org admins can only access analytics for their organizations (must provide organizationId)
    const isMasterAdmin = user.role === 'admin';
    
    if (isMasterAdmin) {
      // Master admin can access everything, proceed
    } else if (organizationId) {
      // Check if user is org admin of this organization
      const isOrgAdmin = await isOrgAdminOf(user.id, organizationId);
      if (!isOrgAdmin) {
        return json({ ok: false, error: 'Unauthorized - Org admin access required for this organization' }, { status: 403 });
      }
      // Org admin can access, proceed
    } else {
      // Non-admin trying to access without organizationId
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    // Build date filter
    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    
    if (dateFrom || dateTo) {
      dateFilter = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        dateFilter.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
    } else {
      // Use timeRange if no specific dates
      let startDate: Date | undefined;
      if (timeRange === '7d') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
      } else if (timeRange === '30d') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
      } else if (timeRange === '90d') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
      }
      
      if (startDate) {
        startDate.setHours(0, 0, 0, 0);
        dateFilter = { gte: startDate };
      }
    }
    
    // Build where clause
    const where: any = {};
    if (dateFilter) {
      where.createdAt = dateFilter;
    }
    
    // Handle userId and organizationId filters
    let userIdFilter: any = null;
    
    // If organizationId provided, restrict to approved members' userIds
    if (organizationId) {
      const members = await prisma.organizationMembership.findMany({
        where: { organizationId, status: 'approved' },
        select: { userId: true }
      });
      const memberIds = members.map(m => m.userId);
      if (memberIds.length === 0) {
        return json({
          ok: true,
          analytics: {
            usersOverTime: {},
            gamesPerDay: {},
            avgScoresByGameType: {},
            activeUsersPerDay: {},
            gameTypeStats: {},
            difficultyStats: {},
            scoreDistribution: [0,0,0,0,0],
            timeSeriesByGame: {},
            timeSeriesByDifficulty: {},
            topPerformers: [],
            timeRange,
            filters: { userId: userId || null, gameType: gameType || null, difficulty: difficulty || null, dateFrom: dateFrom || null, dateTo: dateTo || null, organizationId },
            availableUsers: []
          }
        });
      }
      
      // If userId is also specified, ensure it's in the member list
      if (userId) {
        if (!memberIds.includes(userId)) {
          // User is not a member of this organization, return empty results
          return json({
            ok: true,
            analytics: {
              usersOverTime: {},
              gamesPerDay: {},
              avgScoresByGameType: {},
              activeUsersPerDay: {},
              gameTypeStats: {},
              difficultyStats: {},
              scoreDistribution: [0,0,0,0,0],
              timeSeriesByGame: {},
              timeSeriesByDifficulty: {},
              topPerformers: [],
              timeRange,
              filters: { userId: userId || null, gameType: gameType || null, difficulty: difficulty || null, dateFrom: dateFrom || null, dateTo: dateTo || null, organizationId },
              availableUsers: []
            }
          });
        }
        // User is a member, filter by specific userId
        userIdFilter = userId;
      } else {
        // No specific userId, filter by all member IDs
        userIdFilter = { in: memberIds };
      }
    } else if (userId) {
      // Only userId filter, no organizationId
      userIdFilter = userId;
    }
    
    // Apply userId filter if we have one
    if (userIdFilter) {
      where.userId = userIdFilter;
    }
    if (gameType) {
      where.gameType = gameType;
    }
    if (difficulty) {
      // Combine difficulty filter with existing conditions using AND
      const difficultyConditions = [
        { difficulty },
        { level: difficulty }
      ];
      
      // If we already have other conditions, we need to use AND with OR
      if (Object.keys(where).length > 0) {
        // Create a base condition object
        const baseWhere = { ...where };
        where.AND = [
          baseWhere,
          {
            OR: difficultyConditions
          }
        ];
        // Remove the individual fields that are now in baseWhere
        if (baseWhere.createdAt) delete where.createdAt;
        if (baseWhere.userId) delete where.userId;
        if (baseWhere.gameType) delete where.gameType;
      } else {
        // Simple OR if no other conditions
        where.OR = difficultyConditions;
      }
    }
    
    // Get all sessions matching filters
    const sessions = await prisma.gameSession.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        questions: true,
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    // Get all users for filter dropdown
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Time series: users over time (only if not filtering by user)
    const usersOverTime: Record<string, number> = {};
    if (!userId) {
      const userSignupsWhere: any = {};
      if (dateFilter) {
        userSignupsWhere.createdAt = dateFilter;
      }
      const userSignups = await prisma.user.findMany({
        where: userSignupsWhere,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      });
      
      let cumulativeUsers = 0;
      userSignups.forEach((user: { createdAt: Date }) => {
        cumulativeUsers++;
        const date = user.createdAt.toISOString().split('T')[0];
        usersOverTime[date] = cumulativeUsers;
      });
    }
    
    // Games played per day
    const gamesPerDay: Record<string, { total: number; byGameType: Record<string, number> }> = {};
    sessions.forEach((session) => {
      const date = session.createdAt.toISOString().split('T')[0];
      if (!gamesPerDay[date]) {
        gamesPerDay[date] = { total: 0, byGameType: {} };
      }
      gamesPerDay[date].total++;
      if (!gamesPerDay[date].byGameType[session.gameType]) {
        gamesPerDay[date].byGameType[session.gameType] = 0;
      }
      gamesPerDay[date].byGameType[session.gameType]++;
    });
    
    // Performance by game type (detailed)
    const gameTypeStats: Record<string, {
      count: number;
      avgScore: number;
      avgPercentage: number;
      totalQuestions: number;
      correctQuestions: number;
      avgTimeMs: number;
      difficultyBreakdown: Record<string, { count: number; avgPercentage: number }>;
      trendOverTime: Array<{ date: string; avgPercentage: number; count: number }>;
    }> = {};
    
    // Performance by difficulty/level (detailed)
    const difficultyStats: Record<string, {
      count: number;
      avgPercentage: number;
      avgTimeMs: number;
      gameTypeBreakdown: Record<string, { count: number; avgPercentage: number }>;
    }> = {};
    
    // Score distribution buckets (0-20, 21-40, 41-60, 61-80, 81-100)
    const scoreDistribution = [0, 0, 0, 0, 0]; // 5 buckets
    
    // Time series data for trends
    const timeSeriesByGame: Record<string, Record<string, { date: string; score: number; percentage: number; count: number; timeMs: number }>> = {};
    const timeSeriesByDifficulty: Record<string, Record<string, { date: string; avgPercentage: number; count: number }>> = {};
    
    sessions.forEach((session) => {
      const date = session.createdAt.toISOString().split('T')[0];
      const percentage = session.total > 0 ? (session.score / session.total) * 100 : 0;
      const difficultyOrLevel = session.difficulty || session.level || 'unknown';
      
      // Game type stats
      if (!gameTypeStats[session.gameType]) {
        gameTypeStats[session.gameType] = {
          count: 0,
          avgScore: 0,
          avgPercentage: 0,
          totalQuestions: 0,
          correctQuestions: 0,
          avgTimeMs: 0,
          difficultyBreakdown: {},
          trendOverTime: []
        };
      }
      
      const gtStats = gameTypeStats[session.gameType];
      gtStats.count++;
      gtStats.avgScore += session.score;
      gtStats.avgPercentage += percentage;
      gtStats.totalQuestions += session.total;
      gtStats.correctQuestions += session.score;
      if (session.timeMs) {
        gtStats.avgTimeMs += session.timeMs;
      }
      
      // Difficulty breakdown per game type
      if (!gtStats.difficultyBreakdown[difficultyOrLevel]) {
        gtStats.difficultyBreakdown[difficultyOrLevel] = { count: 0, avgPercentage: 0 };
      }
      gtStats.difficultyBreakdown[difficultyOrLevel].count++;
      gtStats.difficultyBreakdown[difficultyOrLevel].avgPercentage += percentage;
      
      // Difficulty stats
      if (!difficultyStats[difficultyOrLevel]) {
        difficultyStats[difficultyOrLevel] = {
          count: 0,
          avgPercentage: 0,
          avgTimeMs: 0,
          gameTypeBreakdown: {}
        };
      }
      
      const diffStats = difficultyStats[difficultyOrLevel];
      diffStats.count++;
      diffStats.avgPercentage += percentage;
      if (session.timeMs) {
        diffStats.avgTimeMs += session.timeMs;
      }
      
      // Game type breakdown per difficulty
      if (!diffStats.gameTypeBreakdown[session.gameType]) {
        diffStats.gameTypeBreakdown[session.gameType] = { count: 0, avgPercentage: 0 };
      }
      diffStats.gameTypeBreakdown[session.gameType].count++;
      diffStats.gameTypeBreakdown[session.gameType].avgPercentage += percentage;
      
      // Score distribution
      const bucket = Math.floor(percentage / 20);
      if (bucket >= 0 && bucket < 5) {
        scoreDistribution[bucket]++;
      }
      
      // Time series by game type
      if (!timeSeriesByGame[session.gameType]) {
        timeSeriesByGame[session.gameType] = {};
      }
      if (!timeSeriesByGame[session.gameType][date]) {
        timeSeriesByGame[session.gameType][date] = {
          date,
          score: 0,
          percentage: 0,
          count: 0,
          timeMs: 0
        };
      }
      const tsGame = timeSeriesByGame[session.gameType][date];
      tsGame.score += session.score;
      tsGame.percentage += percentage;
      tsGame.count++;
      if (session.timeMs) {
        tsGame.timeMs += session.timeMs;
      }
      
    // Time series by difficulty
    if (!timeSeriesByDifficulty[difficultyOrLevel]) {
      timeSeriesByDifficulty[difficultyOrLevel] = {};
    }
    if (!timeSeriesByDifficulty[difficultyOrLevel][date]) {
      timeSeriesByDifficulty[difficultyOrLevel][date] = {
        date,
        avgPercentage: 0,
        totalPercentage: 0,
        count: 0
      };
    }
    const tsDiff = timeSeriesByDifficulty[difficultyOrLevel][date];
    tsDiff.totalPercentage += percentage;
    tsDiff.count++;
    });
    
    // Calculate averages
    Object.keys(gameTypeStats).forEach((gt) => {
      const stats = gameTypeStats[gt];
      stats.avgScore = stats.count > 0 ? stats.avgScore / stats.count : 0;
      stats.avgPercentage = stats.count > 0 ? stats.avgPercentage / stats.count : 0;
      stats.avgTimeMs = stats.count > 0 ? stats.avgTimeMs / stats.count : 0;
      
      Object.keys(stats.difficultyBreakdown).forEach((diff) => {
        const db = stats.difficultyBreakdown[diff];
        db.avgPercentage = db.count > 0 ? db.avgPercentage / db.count : 0;
      });
      
      // Build trend over time
      const dates = Object.keys(timeSeriesByGame[gt] || {}).sort();
      stats.trendOverTime = dates.map(date => {
        const ts = timeSeriesByGame[gt][date];
        return {
          date,
          avgPercentage: ts.count > 0 ? ts.percentage / ts.count : 0,
          count: ts.count
        };
      });
    });
    
    Object.keys(difficultyStats).forEach((diff) => {
      const stats = difficultyStats[diff];
      stats.avgPercentage = stats.count > 0 ? stats.avgPercentage / stats.count : 0;
      stats.avgTimeMs = stats.count > 0 ? stats.avgTimeMs / stats.count : 0;
      
      Object.keys(stats.gameTypeBreakdown).forEach((gt) => {
        const gtb = stats.gameTypeBreakdown[gt];
        gtb.avgPercentage = gtb.count > 0 ? gtb.avgPercentage / gtb.count : 0;
      });
    });
    
    // Calculate averages for difficulty time series
    Object.keys(timeSeriesByDifficulty).forEach((diff) => {
      Object.keys(timeSeriesByDifficulty[diff]).forEach((date) => {
        const ts = timeSeriesByDifficulty[diff][date];
        ts.avgPercentage = ts.count > 0 ? ts.totalPercentage / ts.count : 0;
      });
    });
    
    // Average scores by game type (simple format for backward compatibility)
    const avgScoresByGameType: Record<string, { avgScore: number; avgPercentage: number; count: number }> = {};
    Object.keys(gameTypeStats).forEach((gt) => {
      avgScoresByGameType[gt] = {
        avgScore: gameTypeStats[gt].avgScore,
        avgPercentage: gameTypeStats[gt].avgPercentage,
        count: gameTypeStats[gt].count
      };
    });
    
    // User engagement: active users per day
    const activeUsersPerDay: Record<string, Set<string>> = {};
    sessions.forEach((session) => {
      const date = session.createdAt.toISOString().split('T')[0];
      if (!activeUsersPerDay[date]) {
        activeUsersPerDay[date] = new Set();
      }
      activeUsersPerDay[date].add(session.userId);
    });
    
    const activeUsersCount: Record<string, number> = {};
    Object.keys(activeUsersPerDay).forEach((date) => {
      activeUsersCount[date] = activeUsersPerDay[date].size;
    });
    
    // Top performers (top 10 users by average score)
    const userPerformance: Record<string, { sessions: number; totalScore: number; totalQuestions: number; avgPercentage: number }> = {};
    sessions.forEach((session) => {
      if (!userPerformance[session.userId]) {
        userPerformance[session.userId] = {
          sessions: 0,
          totalScore: 0,
          totalQuestions: 0,
          avgPercentage: 0
        };
      }
      const up = userPerformance[session.userId];
      up.sessions++;
      up.totalScore += session.score;
      up.totalQuestions += session.total;
    });
    
    const topPerformers = Object.entries(userPerformance)
      .map(([userId, stats]) => ({
        userId,
        username: sessions.find(s => s.userId === userId)?.user?.username || 'Unknown',
        ...stats,
        avgPercentage: stats.totalQuestions > 0 ? (stats.totalScore / stats.totalQuestions) * 100 : 0
      }))
      .sort((a, b) => b.avgPercentage - a.avgPercentage)
      .slice(0, 10);
    
    return json({
      ok: true,
      analytics: {
        usersOverTime,
        gamesPerDay,
        avgScoresByGameType,
        activeUsersPerDay: activeUsersCount,
        gameTypeStats,
        difficultyStats,
        scoreDistribution,
        timeSeriesByGame,
        timeSeriesByDifficulty,
        topPerformers,
        timeRange,
        filters: {
          userId: userId || null,
          gameType: gameType || null,
          difficulty: difficulty || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          organizationId: organizationId || null
        },
        availableUsers: allUsers.map(u => ({ id: u.id, username: u.username }))
      }
    });
  } catch (error: any) {
    console.error('[GET /api/admin/analytics] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
};
