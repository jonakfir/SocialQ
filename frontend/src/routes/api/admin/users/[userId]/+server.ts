import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  const user = await getAdminUserFromRequest(event.request);
  return user ? { id: user.id } : null;
}

export const DELETE: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userIdParam = event.params.userId;
    if (!userIdParam) return json({ ok: false, error: 'User ID required' }, { status: 400 });
    const userIdNum = toPrismaUserId(userIdParam);

    const user = await prisma.user.findUnique({ where: { id: userIdNum } });
    if (!user) return json({ ok: false, error: 'User not found' }, { status: 404 });

    await prisma.user.delete({ where: { id: userIdNum } });

    return json({ ok: true });
  } catch (error: any) {
    console.error('[DELETE /api/admin/users/[userId]] error:', error);
    return json({ ok: false, error: error?.message || 'Failed to delete user' }, { status: 500 });
  }
};
