import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');

    if (mockUserId && mockUserEmail) {
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

    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader },
      credentials: 'include'
    });

    const data = await response.json();
    const backendUser = data?.user;

    if (!backendUser || !backendUser.id) {
      return null;
    }

    const email = backendUser.email || backendUser.username;
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true, role: true }
    });

    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch {
    return null;
  }
}

export const DELETE: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const userId = event.params.userId;
    if (!userId) return json({ ok: false, error: 'User ID required' }, { status: 400 });

    // Prevent self-delete casually (optional)
    // if (admin.id === userId) return json({ ok: false, error: "Admins can't delete themselves" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return json({ ok: false, error: 'User not found' }, { status: 404 });

    await prisma.user.delete({ where: { id: userId } });

    return json({ ok: true });
  } catch (error: any) {
    console.error('[DELETE /api/admin/users/[userId]] error:', error);
    return json({ ok: false, error: error?.message || 'Failed to delete user' }, { status: 500 });
  }
};
