import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true }
      });
      if (user) return user;
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
    if (!email) return null;
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true }
    });
    return prismaUser ? { id: prismaUser.id } : null;
  } catch {
    return null;
  }
}

const ALLOWED_MODULES_FOR_PHOTO = ['7']; // mirroring

/** POST /api/user/verified-module - Submit verified photo for a module (e.g. mirroring). Body: { moduleId: string, photoDataUrl?: string } */
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const body = await event.request.json().catch(() => ({}));
    const moduleId = String(body?.moduleId || '').trim();
    if (!moduleId || !ALLOWED_MODULES_FOR_PHOTO.includes(moduleId)) {
      return json({ ok: false, error: 'Invalid or disallowed moduleId. Use 7 for mirroring.' }, { status: 400 });
    }
    const photoDataUrl = body.photoDataUrl != null ? String(body.photoDataUrl) : null;
    await prisma.verifiedModuleCompletion.upsert({
      where: {
        userId_moduleId: { userId: user.id, moduleId }
      },
      create: {
        userId: user.id,
        moduleId,
        source: 'photo',
        photoDataUrl: photoDataUrl || undefined,
        verifiedByUserId: undefined
      },
      update: {
        source: 'photo',
        photoDataUrl: photoDataUrl || undefined,
        verifiedByUserId: undefined
      }
    });
    return json({ ok: true, moduleId });
  } catch (e: any) {
    console.error('[POST /api/user/verified-module]', e);
    return json({ ok: false, error: e?.message || 'Failed to save verified module' }, { status: 500 });
  }
};
