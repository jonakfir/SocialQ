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
 * GET /api/admin/stats/users/[userId] - Detailed user statistics
 * Admin only
 */
export const GET: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userId = event.params.userId;
    
    if (!userId) {
      return json({ ok: false, error: 'User ID required' }, { status: 400 });
    }
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!user) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    
    // Get user's friends
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: userId },
          { userId2: userId }
        ]
      },
      include: {
        user1: {
          select: {
            id: true,
            username: true
          }
        },
        user2: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Format friends list (exclude current user, include friend info)
    const friends = friendships.map(friendship => {
      const friend = friendship.userId1 === userId ? friendship.user2 : friendship.user1;
      return {
        id: friend.id,
        username: friend.username,
        connectedAt: friendship.createdAt
      };
    });
    
    // Get user's collages/photos
    const collages = await prisma.collage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        imageUrl: true,
        emotions: true,
        createdAt: true
      }
    });
    
    // Get all game sessions for this user
    const sessions = await prisma.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        questions: true
      }
    });
    
    // Calculate statistics by game type
    const gameTypeStats: Record<string, {
      count: number;
      avgScore: number;
      avgPercentage: number;
      totalQuestions: number;
      correctQuestions: number;
      sessions: any[];
    }> = {};
    
    sessions.forEach((session) => {
      if (!gameTypeStats[session.gameType]) {
        gameTypeStats[session.gameType] = {
          count: 0,
          avgScore: 0,
          avgPercentage: 0,
          totalQuestions: 0,
          correctQuestions: 0,
          sessions: []
        };
      }
      
      const stats = gameTypeStats[session.gameType];
      stats.count++;
      stats.avgScore += session.score;
      const percentage = session.total > 0 ? (session.score / session.total) * 100 : 0;
      stats.avgPercentage += percentage;
      stats.totalQuestions += session.total;
      stats.correctQuestions += session.score;
      stats.sessions.push(session);
    });
    
    // Calculate averages
    Object.keys(gameTypeStats).forEach((gameType) => {
      const stats = gameTypeStats[gameType];
      stats.avgScore = stats.count > 0 ? stats.avgScore / stats.count : 0;
      stats.avgPercentage = stats.count > 0 ? stats.avgPercentage / stats.count : 0;
    });
    
    // Time series data for charts (grouped by date)
    const timeSeriesData: Record<string, Array<{ date: string; score: number; percentage: number; gameType: string }>> = {};
    
    sessions.forEach((session) => {
      const date = session.createdAt.toISOString().split('T')[0];
      const percentage = session.total > 0 ? (session.score / session.total) * 100 : 0;
      
      if (!timeSeriesData[session.gameType]) {
        timeSeriesData[session.gameType] = [];
      }
      
      timeSeriesData[session.gameType].push({
        date,
        score: session.score,
        percentage,
        gameType: session.gameType
      });
    });
    
    // Group by difficulty/level
    const difficultyStats: Record<string, Record<string, { count: number; avgPercentage: number }>> = {};
    
    sessions.forEach((session) => {
      const difficultyOrLevel = session.difficulty || session.level || 'unknown';
      if (!difficultyStats[session.gameType]) {
        difficultyStats[session.gameType] = {};
      }
      if (!difficultyStats[session.gameType][difficultyOrLevel]) {
        difficultyStats[session.gameType][difficultyOrLevel] = { count: 0, avgPercentage: 0 };
      }
      const stats = difficultyStats[session.gameType][difficultyOrLevel];
      stats.count++;
      const percentage = session.total > 0 ? (session.score / session.total) * 100 : 0;
      stats.avgPercentage += percentage;
    });
    
    // Calculate averages
    Object.keys(difficultyStats).forEach((gameType) => {
      Object.keys(difficultyStats[gameType]).forEach((diff) => {
        const stats = difficultyStats[gameType][diff];
        stats.avgPercentage = stats.count > 0 ? stats.avgPercentage / stats.count : 0;
      });
    });
    
    return json({
      ok: true,
      user,
      friends: {
        count: friends.length,
        list: friends
      },
      collages: {
        count: collages.length,
        list: collages
      },
      stats: {
        totalSessions: sessions.length,
        gameTypeStats,
        timeSeriesData,
        difficultyStats,
        recentSessions: sessions.slice(0, 20) // Last 20 sessions
      }
    });
  } catch (error: any) {
    console.error('[GET /api/admin/stats/users/[userId]] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
};
