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
      return user || null;
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      credentials: 'include'
    });
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) return null;
    const prismaUser = await prisma.user.findFirst({
      where: { username: backendUser.email },
      select: { id: true }
    });
    return prismaUser || null;
  } catch {
    return null;
  }
}

// GET /api/user/org-status - Get user's organization admin status and primary org
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Find all approved org_admin memberships for this user
    const memberships = await prisma.organizationMembership.findMany({
      where: {
        userId: user.id,
        role: 'org_admin',
        status: 'approved'
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    // Filter to only approved organizations
    const approvedOrgs = memberships
      .filter(m => m.organization.status === 'approved')
      .map(m => m.organization);

    if (approvedOrgs.length === 0) {
      return json({ ok: true, isOrgAdmin: false, orgs: [] });
    }

    // Return primary org (first one) and all orgs
    return json({
      ok: true,
      isOrgAdmin: true,
      primaryOrgId: approvedOrgs[0].id,
      primaryOrgName: approvedOrgs[0].name,
      orgs: approvedOrgs
    });
  } catch (error: any) {
    console.error('[GET /api/user/org-status] error', error);
    return json({ ok: false, error: error?.message || 'Failed to check org status' }, { status: 500 });
  }
};

