import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * GET /api/admin/get-user-role - Get user role from Prisma by email
 * Used by backend to get role information for auth responses
 * Query param: email
 */
export const GET: RequestHandler = async (event) => {
  try {
    const email = event.url.searchParams.get('email');
    
    if (!email) {
      return json({ ok: false, error: 'Email required' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        username: email.trim().toLowerCase()
      },
      select: {
        id: true,
        username: true,
        role: true
      }
    });

    if (!user) {
      return json({ ok: false, error: 'User not found' });
    }

    return json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'personal'
      }
    });
  } catch (error: any) {
    console.error('[GET /api/admin/get-user-role] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to get user role' },
      { status: 500 }
    );
  }
};
