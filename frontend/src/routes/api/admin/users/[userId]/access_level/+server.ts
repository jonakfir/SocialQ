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
      if (user && user.role === 'admin') return { id: String(user.id) };
      return null;
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
    if (!backendUser || !backendUser.id) return null;
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

/**
 * PATCH /api/admin/users/[userId]/access_level - Update user access level
 * Body: { accessLevel: "pro" | "free_trial" | "none" }
 * Admin only. Updates backend DB (source of truth for iOS app).
 */
export const PATCH: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = event.params.userId;
    const body = await event.request.json();
    const { accessLevel, trialEndsAt } = body;
    if (!userId) {
      return json({ ok: false, error: 'User ID required' }, { status: 400 });
    }
    if (!['pro', 'free_trial', 'none'].includes(accessLevel)) {
      return json({ ok: false, error: 'Invalid access level. Must be "pro", "free_trial", or "none"' }, { status: 400 });
    }
    const prismaUser = await prisma.user.findUnique({
      where: { id: toPrismaUserId(userId) },
      select: { username: true }
    });
    if (!prismaUser) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const backendUsersResponse = await fetch(`${base}/admin/users`, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      credentials: 'include'
    });
    if (!backendUsersResponse.ok) {
      return json({ ok: false, error: 'Failed to fetch backend users' }, { status: 502 });
    }
    const backendData = await backendUsersResponse.json();
    const backendUser = (backendData.users || []).find(
      (u: any) => (u.email || u.username || '').toLowerCase() === prismaUser.username.toLowerCase()
    );
    if (!backendUser) {
      return json({ ok: false, error: 'User not found in backend' }, { status: 404 });
    }
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Cookie: cookieHeader };
    if (authHeader) headers['Authorization'] = authHeader;
    const backendResponse = await fetch(`${base}/admin/users/${backendUser.id}/access_level`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ accessLevel, trialEndsAt: trialEndsAt ?? undefined })
    });
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('[PATCH access_level] Backend failed:', errorText);
      return json({ ok: false, error: 'Backend update failed' }, { status: 502 });
    }
    return json({ ok: true, accessLevel });
  } catch (error: any) {
    console.error('[PATCH /api/admin/users/[userId]/access_level] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to update access level' },
      { status: 500 }
    );
  }
};
