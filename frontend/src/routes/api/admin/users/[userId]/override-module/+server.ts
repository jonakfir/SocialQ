import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  const user = await getAdminUserFromRequest(event.request);
  return user ? { id: user.id } : null;
}

/** POST /api/admin/users/[userId]/override-module - Admin marks user as passed for a journey module without verified photo. Body: { moduleId: string } */
export const POST: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    const targetUserId = event.params.userId;
    if (!targetUserId) return json({ ok: false, error: 'User ID required' }, { status: 400 });
    const body = await event.request.json().catch(() => ({}));
    const moduleId = String(body?.moduleId || '').trim();
    if (!moduleId) return json({ ok: false, error: 'moduleId required (e.g. "7" for mirroring)' }, { status: 400 });

    const targetNumId = toPrismaUserId(targetUserId);
    const adminNumId = toPrismaUserId(admin.id);
    const target = await prisma.user.findUnique({ where: { id: targetNumId } });
    if (!target) return json({ ok: false, error: 'User not found' }, { status: 404 });

    await prisma.verifiedModuleCompletion.upsert({
      where: {
        userId_moduleId: { userId: targetNumId, moduleId }
      },
      create: {
        userId: targetNumId,
        moduleId,
        source: 'admin_override',
        verifiedByUserId: adminNumId,
        photoDataUrl: undefined
      },
      update: {
        source: 'admin_override',
        verifiedByUserId: adminNumId,
        photoDataUrl: undefined
      }
    });
    return json({ ok: true, moduleId });
  } catch (e: any) {
    console.error('[POST /api/admin/users/[userId]/override-module]', e);
    return json({ ok: false, error: e?.message || 'Failed to set override' }, { status: 500 });
  }
};
