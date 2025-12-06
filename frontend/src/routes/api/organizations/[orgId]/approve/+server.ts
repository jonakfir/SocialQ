import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserEmail) {
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
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers: { Cookie: cookieHeader }, credentials: 'include' });
    const data = await response.json();
    const email = data?.user?.email;
    if (!email) return null;
    const prismaUser = await prisma.user.findFirst({ where: { username: email }, select: { id: true, role: true } });
    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch {
    return null;
  }
}

// POST /api/organizations/[orgId]/approve  body: { action: 'approve'|'reject' }
export const POST: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) return json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    const orgId = event.params.orgId!;
    const body = await event.request.json();
    const action = (String(body?.action || 'approve').toLowerCase() === 'reject') ? 'rejected' : 'approved';

    const org = await prisma.organization.update({
      where: { id: orgId },
      data: { status: action }
    });

    // Auto-approve memberships if org approved
    if (action === 'approved') {
      await prisma.organizationMembership.updateMany({
        where: { organizationId: orgId, status: 'pending' },
        data: { status: 'approved' }
      });
    }

    return json({ ok: true, organization: { id: org.id, status: org.status } });
  } catch (error: any) {
    console.error('[POST /api/organizations/[orgId]/approve] error', error);
    return json({ ok: false, error: error?.message || 'Failed to change org status' }, { status: 500 });
  }
};


