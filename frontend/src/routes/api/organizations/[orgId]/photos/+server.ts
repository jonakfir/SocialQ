import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUserId(event: { request: Request }): Promise<string | null> {
  try {
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserEmail) {
      const user = await prisma.user.findFirst({ where: { username: mockUserEmail.trim().toLowerCase() }, select: { id: true } });
      return user?.id ?? null;
    }
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers: { Cookie: cookieHeader }, credentials: 'include' });
    const data = await response.json();
    const email = data?.user?.email;
    if (!email) return null;
    const prismaUser = await prisma.user.findFirst({ where: { username: email }, select: { id: true } });
    return prismaUser?.id ?? null;
  } catch { return null; }
}

async function isOrgAdmin(userId: string, orgId: string) {
  const m = await prisma.organizationMembership.findFirst({
    where: { organizationId: orgId, userId, status: 'approved', role: 'org_admin' },
    select: { id: true }
  });
  return !!m;
}

// GET /api/organizations/[orgId]/photos - org admins can view member photos
export const GET: RequestHandler = async (event) => {
  try {
    const orgId = event.params.orgId!;
    const currentUserId = await getCurrentUserId(event);
    if (!currentUserId) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const can = await isOrgAdmin(currentUserId, orgId);
    if (!can) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId, status: 'approved' },
      select: { userId: true }
    });
    const memberIds = members.map(m => m.userId);
    const photos = await prisma.collage.findMany({
      where: { userId: { in: memberIds } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true, imageUrl: true, emotions: true, createdAt: true }
    });
    return json({ ok: true, photos });
  } catch (error: any) {
    console.error('[GET /api/organizations/[orgId]/photos] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch photos' }, { status: 500 });
  }
};


