import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserEmail) {
      const user = await prisma.user.findFirst({ where: { username: mockUserEmail.trim().toLowerCase() }, select: { id: true } });
      return user || null;
    }
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers: { Cookie: cookieHeader }, credentials: 'include' });
    const data = await response.json();
    const email = data?.user?.email;
    if (!email) return null;
    const prismaUser = await prisma.user.findFirst({ where: { username: email }, select: { id: true } });
    return prismaUser || null;
  } catch {
    return null;
  }
}

// POST /api/organizations/[orgId]/join  → creates pending membership
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const orgId = event.params.orgId!;

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { status: true } });
    if (!org || org.status !== 'approved') {
      return json({ ok: false, error: 'Organization is not available for joining' }, { status: 400 });
    }

    const membership = await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      update: { status: 'pending' },
      create: { organizationId: orgId, userId: user.id, status: 'pending', role: 'member' },
      select: { id: true, status: true }
    });

    return json({ ok: true, membership });
  } catch (error: any) {
    console.error('[POST /api/organizations/[orgId]/join] error', error);
    return json({ ok: false, error: error?.message || 'Failed to request join' }, { status: 500 });
  }
};


