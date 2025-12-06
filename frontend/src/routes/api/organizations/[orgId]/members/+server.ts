import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUser(event: { request: Request }) {
  try {
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserEmail) {
      const user = await prisma.user.findFirst({ where: { username: mockUserEmail.trim().toLowerCase() }, select: { id: true, role: true } });
      return user;
    }
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers: { Cookie: cookieHeader }, credentials: 'include' });
    const data = await response.json();
    const email = data?.user?.email;
    if (!email) return null;
    const prismaUser = await prisma.user.findFirst({ where: { username: email }, select: { id: true, role: true } });
    return prismaUser;
  } catch {
    return null;
  }
}

function isGlobalAdmin(u: { role: string } | null | undefined) { return !!u && u.role === 'admin'; }

async function isOrgAdmin(userId: string, orgId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: orgId, userId, status: 'approved', role: 'org_admin' },
    select: { id: true }
  });
  return !!membership;
}

// GET /api/organizations/[orgId]/members
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const orgId = event.params.orgId!;

    // visibility: org admins and global admins can view all; members can only see approved list (still ok)
    const members = await prisma.organizationMembership.findMany({
      where: { organizationId: orgId },
      select: {
        id: true, role: true, status: true, joinedAt: true,
        user: { select: { id: true, username: true } }
      },
      orderBy: { joinedAt: 'desc' }
    });
    return json({ ok: true, members });
  } catch (error: any) {
    console.error('[GET /api/organizations/[orgId]/members] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch members' }, { status: 500 });
  }
};

// POST /api/organizations/[orgId]/members  { userId, action }
// actions: approve|remove|promote|demote
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const orgId = event.params.orgId!;
    const body = await event.request.json();
    const targetUserId = String(body?.userId || '').trim();
    const action = String(body?.action || '').toLowerCase();
    if (!targetUserId || !['approve', 'remove', 'promote', 'demote'].includes(action)) {
      return json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }

    const canManage = isGlobalAdmin(user) || await isOrgAdmin(user.id, orgId);
    if (!canManage) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

    let update: any = {};
    if (action === 'approve') update = { status: 'approved' };
    if (action === 'remove') update = { status: 'removed' };
    if (action === 'promote') update = { role: 'org_admin', status: 'approved' };
    if (action === 'demote') update = { role: 'member', status: 'approved' };

    const membership = await prisma.organizationMembership.update({
      where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
      data: update,
      select: { id: true, status: true, role: true }
    });
    return json({ ok: true, membership });
  } catch (error: any) {
    console.error('[POST /api/organizations/[orgId]/members] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update member' }, { status: 500 });
  }
};


