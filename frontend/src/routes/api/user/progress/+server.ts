import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  const cookies = event.request.headers.get('cookie') || '';
  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch) return null;

  try {
    const { prisma } = await import('$lib/prisma');
    const userId = sessionMatch[1];
    const numId = /^\d+$/.test(userId) ? parseInt(userId, 10) : NaN;
    if (Number.isNaN(numId)) return null;
    const user = await prisma.user.findUnique({ where: { id: numId } });
    return user ? { id: String(user.id) } : null;
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Lazy load prisma to avoid blocking startup
    const { prisma } = await import('$lib/prisma');
    
    // Get user's game sessions to calculate progress
    const sessions = await prisma.gameSession.findMany({
      where: { userId: toPrismaUserId(user.id) },
      select: { gameType: true, score: true, total: true }
    });

    // Calculate completion based on sessions
    // This is a simplified calculation - adjust based on your needs
    const totalModules = 13;
    const completedModules: string[] = [];
    
    // Map game types to module IDs (simplified)
    const gameTypeToModule: Record<string, string> = {
      'facial_recognition': '1',
      'transition_recognition': '3',
      'mirroring': '7'
    };

    sessions.forEach(session => {
      if (session.score === session.total && gameTypeToModule[session.gameType]) {
        completedModules.push(gameTypeToModule[session.gameType]);
      }
    });

    const completionPercent = Math.round((completedModules.length / totalModules) * 100);
    const level = Math.floor(completedModules.length / 4) + 1;

    return json({
      ok: true,
      level,
      completionPercent,
      completedModules: [...new Set(completedModules)]
    });
  } catch (error: any) {
    console.error('[GET /api/user/progress] error', error);
    return json({ ok: false, error: error?.message || 'Failed to load progress' }, { status: 500 });
  }
};
