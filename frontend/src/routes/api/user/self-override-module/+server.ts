import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { toPrismaUserId } from '$lib/userId';

type UserWithRole = { id: string; role: string };
type DbError = { _dbError: true };

async function getCurrentUserWithRole(event: { request: Request }): Promise<UserWithRole | null | DbError> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      if (user) return { id: String(user.id), role: user.role };
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
      select: { id: true, role: true }
    });
    if (!prismaUser) return null;
    // Use backend role for admin check (backend is source of truth for auth)
    const role = (backendUser.role || prismaUser.role || 'personal').toString().trim();
    return { id: String(prismaUser.id), role };
  } catch (e: any) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes("can't reach") || msg.includes('database server') || msg.includes('connection')) {
      return { _dbError: true };
    }
    return null;
  }
}

/** POST /api/user/self-override-module - Admin only: mark yourself as passed for a module without verified photo. Body: { moduleId: string } */
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUserWithRole(event);
    if (user && '_dbError' in user)
      return json(
        { ok: false, error: "Database unreachable. Check that your database is running and reachable (e.g. Railway)." },
        { status: 503 }
      );
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const role = (user.role || '').toString().toLowerCase();
    if (role !== 'admin') return json({ ok: false, error: 'Admin only' }, { status: 403 });
    const body = await event.request.json().catch(() => ({}));
    const moduleId = String(body?.moduleId || '').trim();
    if (!moduleId) return json({ ok: false, error: 'moduleId required (e.g. "7" for mirroring)' }, { status: 400 });

    const uid = toPrismaUserId(user.id);
    await prisma.verifiedModuleCompletion.upsert({
      where: {
        userId_moduleId: { userId: uid, moduleId }
      },
      create: {
        userId: uid,
        moduleId,
        source: 'admin_override',
        verifiedByUserId: uid,
        photoDataUrl: undefined
      },
      update: {
        source: 'admin_override',
        verifiedByUserId: uid,
        photoDataUrl: undefined
      }
    });
    return json({ ok: true, moduleId });
  } catch (e: any) {
    console.error('[POST /api/user/self-override-module]', e);
    const msg = e?.message || '';
    const hint =
      msg.includes('verifiedModuleCompletion') || msg.includes('not found or not a function')
        ? "Database setup needed: run 'npm run prisma:generate' in web/frontend, then 'npm run prisma:db:push', and restart the dev server."
        : msg || 'Failed to set override';
    return json({ ok: false, error: hint }, { status: 500 });
  }
};
