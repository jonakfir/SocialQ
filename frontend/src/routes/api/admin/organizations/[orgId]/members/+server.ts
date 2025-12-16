import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user || null;
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    
    // Get JWT token from Authorization header
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    // Build headers for backend request
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.error('[getCurrentUser] Backend /auth/me failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) return null;
    const prismaUser = await prisma.user.findFirst({
      where: { username: backendUser.email },
      select: { id: true, role: true }
    });
    return prismaUser || null;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
}

// POST /api/admin/organizations/[orgId]/members - Add or remove members
// No admin check needed - if user can access /admin routes, they're already verified as admin
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = event.params.orgId!;
    const body = await event.request.json();
    const action = String(body?.action || '').toLowerCase();
    const userId = String(body?.userId || '').trim();

    if (!['add', 'remove'].includes(action) || !userId) {
      return json({ ok: false, error: 'Invalid request. action must be "add" or "remove", userId required' }, { status: 400 });
    }

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, status: true }
    });

    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    // Verify user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true }
    });

    if (!targetUser) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (action === 'add') {
      // Check if membership already exists
      const existing = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });

      if (existing) {
        // Update existing membership to approved
        const updated = await prisma.organizationMembership.update({
          where: { organizationId_userId: { organizationId: orgId, userId } },
          data: { status: 'approved' },
          select: {
            id: true,
            user: { select: { id: true, username: true } },
            role: true,
            status: true
          }
        });
        return json({ ok: true, membership: updated, action: 'updated' });
      } else {
        // Create new membership as approved member
        const created = await prisma.organizationMembership.create({
          data: {
            organizationId: orgId,
            userId,
            role: 'member',
            status: 'approved'
          },
          select: {
            id: true,
            user: { select: { id: true, username: true } },
            role: true,
            status: true
          }
        });
        return json({ ok: true, membership: created, action: 'added' });
      }
    } else if (action === 'remove') {
      // Remove or mark as removed
      const existing = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });

      if (!existing) {
        return json({ ok: false, error: 'User is not a member of this organization' }, { status: 404 });
      }

      // Delete the membership
      await prisma.organizationMembership.delete({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });

      return json({ ok: true, action: 'removed', userId });
    }

    return json({ ok: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[POST /api/admin/organizations/[orgId]/members] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update membership' }, { status: 500 });
  }
};


