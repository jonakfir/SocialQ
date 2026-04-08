import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
}

/**
 * DELETE /api/admin/organizations/[orgId] - Delete an organization (admin only)
 * Cascades: memberships and ekmanImageVisibility are removed by schema.
 */
export const DELETE: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { id: toPrismaUserId(user.id) },
      select: { role: true, username: true }
    });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can delete organizations' }, { status: 403 });
    }

    const orgIdParam = event.params.orgId;
    if (!orgIdParam) {
      return json({ ok: false, error: 'Organization ID required' }, { status: 400 });
    }
    const orgIdNum = parseInt(orgIdParam, 10);
    if (isNaN(orgIdNum)) {
      return json({ ok: false, error: 'Invalid organization ID' }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgIdNum },
      select: { id: true, name: true }
    });
    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    await prisma.organization.delete({
      where: { id: orgIdNum }
    });

    return json({ ok: true, message: `Organization "${org.name}" deleted` });
  } catch (error: any) {
    console.error('[DELETE /api/admin/organizations/[orgId]] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to delete organization' },
      { status: 500 }
    );
  }
};
