import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { toPrismaUserId } from '$lib/userId';

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
    const authHeader = event.request.headers.get('authorization') || '';
    const headers: Record<string, string> = {};
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (authHeader) headers['Authorization'] = authHeader;
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers, credentials: 'include' });
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser || !backendUser.id) return null;
    const email = (backendUser.email || backendUser.username || '').trim().toLowerCase();
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

/** POST /api/admin/users/[userId]/override-module - Admin marks user as passed for a journey module without verified photo. Body: { moduleId: string } */
export const POST: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const targetUserId = event.params.userId;
    if (!targetUserId) return json({ ok: false, error: 'User ID required' }, { status: 400 });
    const body = await event.request.json().catch(() => ({}));
    const moduleId = String(body?.moduleId || '').trim();
    if (!moduleId) return json({ ok: false, error: 'moduleId required (e.g. "7" for mirroring)' }, { status: 400 });

    const targetNumId = toPrismaUserId(targetUserId);
    const adminNumId = toPrismaUserId(admin.id);
    const target = await prisma.user.findUnique({ where: { id: targetNumId }, select: { id: true } });
    if (!target) return json({ ok: false, error: 'User not found' }, { status: 404 });

    await prisma.verifiedModuleCompletion.upsert({
      where: {
        userId_moduleId: { userId: targetNumId, moduleId }
      },
      create: {
        userId: targetNumId,
        moduleId,
        source: 'admin_override',
        verifiedByUserId: adminNumId,
        photoDataUrl: undefined
      },
      update: {
        source: 'admin_override',
        verifiedByUserId: adminNumId,
        photoDataUrl: undefined
      }
    });
    return json({ ok: true, moduleId });
  } catch (e: any) {
    console.error('[POST /api/admin/users/[userId]/override-module]', e);
    return json({ ok: false, error: e?.message || 'Failed to set override' }, { status: 500 });
  }
};
