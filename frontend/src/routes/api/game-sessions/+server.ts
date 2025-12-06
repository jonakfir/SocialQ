import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current user from auth (supports both mock and real auth)
 */
async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    // Check for mock auth header (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true }
      });
      if (user) return { id: user.id };
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
    
    // Find Prisma user by email
    const email = backendUser.email || backendUser.username;
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true }
    });
    
    if (prismaUser) return { id: prismaUser.id };
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/game-sessions - Save a game session
 * Body: {
 *   gameType: "facial_recognition" | "transition_recognition" | "mirroring",
 *   difficulty?: string,
 *   level?: string,
 *   score: number,
 *   total: number,
 *   timeMs?: number,
 *   questions?: Array<{ questionIndex: number, correct: string, picked: string, isCorrect: boolean }>
 * }
 */
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await event.request.json();
    const { gameType, difficulty, level, score, total, timeMs, questions } = body;
    
    // Validate required fields
    if (!gameType || typeof score !== 'number' || typeof total !== 'number') {
      return json({ ok: false, error: 'Missing required fields: gameType, score, total' }, { status: 400 });
    }
    
    // Validate game type
    const validGameTypes = ['facial_recognition', 'transition_recognition', 'mirroring'];
    if (!validGameTypes.includes(gameType)) {
      return json({ ok: false, error: 'Invalid gameType' }, { status: 400 });
    }
    
    // Create game session
    const session = await prisma.gameSession.create({
      data: {
        userId: user.id,
        gameType,
        difficulty: difficulty || null,
        level: level || null,
        score,
        total,
        timeMs: timeMs || null,
        questions: questions ? {
          create: questions.map((q: any) => ({
            questionIndex: q.questionIndex,
            correct: String(q.correct),
            picked: String(q.picked),
            isCorrect: Boolean(q.isCorrect)
          }))
        } : undefined
      },
      include: {
        questions: true
      }
    });
    
    return json({ ok: true, session });
  } catch (error: any) {
    console.error('[POST /api/game-sessions] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to save game session' },
      { status: 500 }
    );
  }
};

/**
 * GET /api/game-sessions - Get current user's game sessions
 * Query params: gameType?, limit?, offset?
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const url = new URL(event.request.url);
    const gameType = url.searchParams.get('gameType');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    
    const where: any = { userId: user.id };
    if (gameType) {
      where.gameType = gameType;
    }
    
    const [sessions, total] = await Promise.all([
      prisma.gameSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          questions: true
        }
      }),
      prisma.gameSession.count({ where })
    ]);
    
    return json({ ok: true, sessions, total });
  } catch (error: any) {
    console.error('[GET /api/game-sessions] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch game sessions' },
      { status: 500 }
    );
  }
};
