import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
}

// PUT /api/admin/ekman-images/[id]/visibility - Update organization visibility
export const PUT: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can update visibility' }, { status: 403 });
    }

    const imageId = event.params.id;
    if (!imageId) {
      return json({ ok: false, error: 'Image ID is required' }, { status: 400 });
    }

    const body = await event.request.json();
    const organizationIds: string[] = body.organizationIds || [];

    // Delete existing visibility records
    await prisma.ekmanImageOrganizationVisibility.deleteMany({
      where: { ekmanImageId: imageId }
    });

    // Create new visibility records if specified
    // organizationId is Int in schema, so parse each string to number
    if (organizationIds.length > 0) {
      await prisma.ekmanImageOrganizationVisibility.createMany({
        data: organizationIds.map(orgId => ({
          ekmanImageId: imageId,
          organizationId: parseInt(String(orgId), 10)
        }))
      });
    }

    return json({ ok: true });
  } catch (error: any) {
    console.error('[PUT /api/admin/ekman-images/[id]/visibility] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update visibility' }, { status: 500 });
  }
};
