import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toPrismaUserId } from '$lib/userId';

/** Get current user (cookies for web, Bearer JWT for mobile). */
async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const { prisma } = await import('$lib/db');
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true }
      });
      if (user) return { id: String(user.id) };
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization') || '';
    const headers: Record<string, string> = {};
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser || !backendUser.id) return null;

    const { prisma } = await import('$lib/db');
    const email = (backendUser.email || backendUser.username || '').trim().toLowerCase();
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true }
    });
    return prismaUser ? { id: String(prismaUser.id) } : null;
  } catch {
    return null;
  }
}

/** Canonical journey tasks (same as mobile JourneyView createDefaultStages) for progress matching. */
const JOURNEY_TASKS: Array<{
  webModuleId: string | null;
  gameType: string;
  difficulty: number | null;
  level: string | null;
  emotion: string | null;
  requiredScore: number;
}> = [
  { webModuleId: '1', gameType: 'facial_recognition', difficulty: 1, level: null, emotion: null, requiredScore: 60 },
  { webModuleId: '3', gameType: 'transition_recognition', difficulty: null, level: 'basic', emotion: null, requiredScore: 65 },
  { webModuleId: null, gameType: 'emotion_training', difficulty: null, level: null, emotion: 'Happy', requiredScore: 70 },
  { webModuleId: '1', gameType: 'facial_recognition', difficulty: 2, level: null, emotion: null, requiredScore: 65 },
  { webModuleId: '4', gameType: 'transition_recognition', difficulty: null, level: 'intermediate', emotion: null, requiredScore: 70 },
  { webModuleId: '2', gameType: 'emotion_training', difficulty: null, level: null, emotion: 'Surprise', requiredScore: 70 },
  { webModuleId: '7', gameType: 'mirroring', difficulty: null, level: null, emotion: null, requiredScore: 65 },
  { webModuleId: '1', gameType: 'facial_recognition', difficulty: 3, level: null, emotion: null, requiredScore: 70 },
  { webModuleId: '6', gameType: 'transition_recognition', difficulty: null, level: 'advanced', emotion: null, requiredScore: 75 },
  { webModuleId: '5', gameType: 'emotion_training', difficulty: null, level: null, emotion: 'Fear', requiredScore: 75 },
  { webModuleId: '7', gameType: 'mirroring', difficulty: null, level: null, emotion: null, requiredScore: 70 },
  { webModuleId: '1', gameType: 'facial_recognition', difficulty: 3, level: null, emotion: null, requiredScore: 75 },
  { webModuleId: '9', gameType: 'facial_recognition', difficulty: 4, level: null, emotion: null, requiredScore: 75 },
  { webModuleId: '8', gameType: 'transition_recognition', difficulty: null, level: 'expert', emotion: null, requiredScore: 80 },
  { webModuleId: '10', gameType: 'emotion_training', difficulty: null, level: null, emotion: 'Sad', requiredScore: 80 },
  { webModuleId: '7', gameType: 'mirroring', difficulty: null, level: null, emotion: null, requiredScore: 75 },
  { webModuleId: '9', gameType: 'facial_recognition', difficulty: 4, level: null, emotion: null, requiredScore: 80 },
  { webModuleId: '13', gameType: 'facial_recognition', difficulty: 5, level: null, emotion: null, requiredScore: 85 },
  { webModuleId: '11', gameType: 'transition_recognition', difficulty: null, level: 'master', emotion: null, requiredScore: 85 },
  { webModuleId: null, gameType: 'emotion_training', difficulty: null, level: null, emotion: 'Anger', requiredScore: 85 },
  { webModuleId: '7', gameType: 'mirroring', difficulty: null, level: null, emotion: null, requiredScore: 85 },
  { webModuleId: '13', gameType: 'facial_recognition', difficulty: 5, level: null, emotion: null, requiredScore: 90 },
];

function matchesTask(
  session: { gameType: string; difficulty: string | null; level: string | null; score: number; total: number },
  task: (typeof JOURNEY_TASKS)[0]
): boolean {
  if (session.gameType !== task.gameType) return false;

  // Emotion training has no percentage score; completion is based on doing the training
  if (task.gameType === 'emotion_training') {
    const taskEmotion = (task.emotion || '').toLowerCase();
    const sessLevel = (session.level || '').toLowerCase();
    if (taskEmotion === sessLevel) return true;
    if ((taskEmotion === 'happy' && sessLevel === 'happiness') || (taskEmotion === 'sad' && sessLevel === 'sadness')) return true;
    return false;
  }

  const pct = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0;
  if (pct < task.requiredScore) return false;

  switch (task.gameType) {
    case 'facial_recognition':
      return task.difficulty == null || session.difficulty === String(task.difficulty);
    case 'transition_recognition':
      if (task.level == null) return true;
      const sessLevel = (session.level || '').toLowerCase();
      if (task.level === 'basic') return ['basic', 'normal', 'easy'].includes(sessLevel);
      if (task.level === 'intermediate') return ['intermediate', 'normal', 'easy'].includes(sessLevel);
      return sessLevel === task.level.toLowerCase();
    case 'mirroring':
      return true;
    default:
      return false;
  }
}

export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { prisma } = await import('$lib/db');
    const uid = toPrismaUserId(user.id);

    const sessions = await prisma.gameSession.findMany({
      where: { userId: uid },
      select: { gameType: true, difficulty: true, level: true, score: true, total: true }
    });

    const completedModuleIds = new Set<string>();

    // Include admin/verified overrides if the model exists
    try {
      const overrides = await (prisma as any).verifiedModuleCompletion?.findMany?.({
        where: { userId: uid },
        select: { moduleId: true }
      });
      if (Array.isArray(overrides)) {
        overrides.forEach((o: { moduleId: string }) => completedModuleIds.add(String(o.moduleId)));
      }
    } catch {
      // VerifiedModuleCompletion may not exist in schema
    }

    for (const task of JOURNEY_TASKS) {
      const passedBySession = sessions.some((s) => matchesTask(s, task));
      const passedByOverride = task.webModuleId != null && completedModuleIds.has(task.webModuleId);
      if (passedBySession) {
        if (task.webModuleId) {
          completedModuleIds.add(task.webModuleId);
        } else if (task.gameType === 'emotion_training' && task.emotion) {
          completedModuleIds.add('emotion_' + task.emotion);
        }
      }
    }

    // Completed task count: task is done if session matched OR its webModuleId is in overrides
    let completedTaskCount = 0;
    for (const task of JOURNEY_TASKS) {
      const passedBySession = sessions.some((s) => matchesTask(s, task));
      const passedByOverride = task.webModuleId != null && completedModuleIds.has(task.webModuleId);
      if (passedBySession || passedByOverride) completedTaskCount += 1;
    }

    const totalTasks = JOURNEY_TASKS.length;
    const completionPercent = totalTasks > 0 ? Math.round((completedTaskCount / totalTasks) * 100) : 0;
    const level = Math.min(5, Math.floor(completedTaskCount / 4) + 1);

    return json({
      ok: true,
      level,
      completionPercent,
      completedModules: [...completedModuleIds]
    });
  } catch (error: any) {
    console.error('[GET /api/user/progress] error', error);
    return json({ ok: false, error: error?.message || 'Failed to load progress' }, { status: 500 });
  }
};
