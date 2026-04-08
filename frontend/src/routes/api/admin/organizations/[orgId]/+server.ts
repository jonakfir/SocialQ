import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    if (!response.ok) return null;
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) return null;
    const prismaUser = await ensurePrismaUser(backendUser.email);
    return prismaUser || null;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
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

    const orgId = event.params.orgId;
    if (!orgId) {
      return json({ ok: false, error: 'Organization ID required' }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true }
    });
    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    await prisma.organization.delete({
      where: { id: orgId }
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
