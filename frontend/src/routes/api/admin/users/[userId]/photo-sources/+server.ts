import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) headers['Authorization'] = authHeader;
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers, credentials: 'include' });
    if (!response.ok) return null;
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) return null;
    const prismaUser = await ensurePrismaUser(backendUser.email);
    return prismaUser;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
}

function parsePhotoSourceSettings(raw: string | null): { ekman: boolean; own: boolean; synthetic: boolean } {
  const defaults = { ekman: false, own: true, synthetic: true };
  if (!raw) return defaults;
  try {
    const o = JSON.parse(raw);
    return {
      ekman: typeof o.ekman === 'boolean' ? o.ekman : defaults.ekman,
      own: typeof o.own === 'boolean' ? o.own : defaults.own,
      synthetic: typeof o.synthetic === 'boolean' ? o.synthetic : defaults.synthetic
    };
  } catch {
    return defaults;
  }
}

export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    if (!isAdmin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const userId = event.params.userId;
    if (!userId) return json({ ok: false, error: 'userId required' }, { status: 400 });
    const target = await prisma.user.findUnique({
      where: { id: toPrismaUserId(userId) },
      select: { id: true, photoSourceSettings: true }
    });
    if (!target) return json({ ok: false, error: 'User not found' }, { status: 404 });
    const settings = parsePhotoSourceSettings(target.photoSourceSettings);
    return json({ ok: true, photoSourceSettings: settings });
  } catch (error: any) {
    console.error('[GET photo-sources]', error);
    return json({ ok: false, error: error?.message || 'Failed' }, { status: 500 });
  }
};

export const PATCH: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    if (!isAdmin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const userIdParam = event.params.userId;
    if (!userIdParam) return json({ ok: false, error: 'userId required' }, { status: 400 });
    const body = await event.request.json().catch(() => ({}));
    const ekman = typeof body.ekman === 'boolean' ? body.ekman : undefined;
    const own = typeof body.own === 'boolean' ? body.own : undefined;
    const synthetic = typeof body.synthetic === 'boolean' ? body.synthetic : undefined;
    if (ekman === undefined && own === undefined && synthetic === undefined) {
      return json({ ok: false, error: 'At least one of ekman, own, synthetic required' }, { status: 400 });
    }
    const target = await prisma.user.findUnique({
      where: { id: toPrismaUserId(userIdParam) },
      select: { id: true, photoSourceSettings: true }
    });
    if (!target) return json({ ok: false, error: 'User not found' }, { status: 404 });
    const current = parsePhotoSourceSettings(target.photoSourceSettings);
    const next = {
      ekman: ekman !== undefined ? ekman : current.ekman,
      own: own !== undefined ? own : current.own,
      synthetic: synthetic !== undefined ? synthetic : current.synthetic
    };
    await prisma.user.update({
      where: { id: toPrismaUserId(userIdParam) },
      data: { photoSourceSettings: JSON.stringify(next) }
    });
    return json({ ok: true, photoSourceSettings: next });
  } catch (error: any) {
    console.error('[PATCH photo-sources]', error);
    return json({ ok: false, error: error?.message || 'Failed' }, { status: 500 });
  }
};
