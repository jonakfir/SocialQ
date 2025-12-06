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

// GET /api/user/role - Get current user's role from backend
export const GET: RequestHandler = async (event) => {
  try {
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    // Get role from backend /auth/me endpoint (which now includes role)
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      credentials: 'include'
    });
    
    const data = await response.json();
    const backendUser = data?.user;
    
    if (!backendUser) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Backend now returns role in /auth/me response
    return json({ ok: true, role: backendUser.role || 'personal' });
  } catch (error: any) {
    console.error('[GET /api/user/role] error', error);
    return json({ ok: false, error: error?.message || 'Failed to get user role' }, { status: 500 });
  }
};


