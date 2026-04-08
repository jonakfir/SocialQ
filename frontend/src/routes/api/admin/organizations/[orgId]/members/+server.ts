import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
}

// POST /api/admin/organizations/[orgId]/members - Add or remove members
// No admin check needed - if user can access /admin routes, they're already verified as admin
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const orgIdParam = event.params.orgId!;
    const orgIdNum = parseInt(orgIdParam, 10);
    if (isNaN(orgIdNum)) {
      return json({ ok: false, error: 'Invalid organization ID' }, { status: 400 });
    }
    const body = await event.request.json();
    const action = String(body?.action || '').toLowerCase();
    const userId = String(body?.userId || '').trim();

    if (!['add', 'remove'].includes(action) || !userId) {
      return json({ ok: false, error: 'Invalid request. action must be "add" or "remove", userId required' }, { status: 400 });
    }
    const userIdNum = toPrismaUserId(userId);

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgIdNum },
      select: { id: true, status: true }
    });

    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    // Verify user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userIdNum },
      select: { id: true, username: true }
    });

    if (!targetUser) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    if (action === 'add') {
      // Check if membership already exists
      const existing = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgIdNum, userId: userIdNum } }
      });

      if (existing) {
        // Update existing membership to approved
        const updated = await prisma.organizationMembership.update({
          where: { organizationId_userId: { organizationId: orgIdNum, userId: userIdNum } },
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
            organizationId: orgIdNum,
            userId: userIdNum,
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
        where: { organizationId_userId: { organizationId: orgIdNum, userId: userIdNum } }
      });

      if (!existing) {
        return json({ ok: false, error: 'User is not a member of this organization' }, { status: 404 });
      }

      // Delete the membership
      await prisma.organizationMembership.delete({
        where: { organizationId_userId: { organizationId: orgIdNum, userId: userIdNum } }
      });

      return json({ ok: true, action: 'removed', userId });
    }

    return json({ ok: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[POST /api/admin/organizations/[orgId]/members] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update membership' }, { status: 500 });
  }
};


