import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
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
      select: { id: true, role: true }
    });
    return prismaUser || null;
  } catch {
    return null;
  }
}

// GET /api/organizations?search=&mine=1
export const GET: RequestHandler = async (event) => {
  try {
    const current = await getCurrentUser(event);
    const url = new URL(event.request.url);
    const search = (url.searchParams.get('search') || '').trim();
    const mine = url.searchParams.get('mine');
    const all = url.searchParams.get('all');
    let where: any = { status: 'approved' };
    // If admin requests all, do not constrain by status
    if (all && current) {
      const me = await prisma.user.findUnique({ where: { id: current.id }, select: { role: true } });
      if (me?.role === 'admin') {
        where = {};
      }
    }
    if (mine && current) {
      // list orgs where current user has any membership (pending or approved)
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: current.id },
        select: { organizationId: true }
      });
      const ids = memberships.map(m => m.organizationId);
      where = { id: { in: ids } };
    }
    const orgs = await prisma.organization.findMany({
      where,
      select: { 
        id: true, 
        name: true, 
        description: true, 
        status: true, 
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    // Filter by search (case-insensitive) if provided, since SQLite doesn't support mode: 'insensitive'
    let filteredOrgs = orgs;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrgs = orgs.filter(org => org.name.toLowerCase().includes(searchLower));
    }
    
    return json({ ok: true, organizations: filteredOrgs });
  } catch (error: any) {
    console.error('[GET /api/organizations] error', error);
    return json({ ok: false, error: error?.message || 'Failed to list organizations' }, { status: 500 });
  }
};

// POST /api/organizations - create org (pending), requester becomes pending org_admin membership
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await event.request.json();
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim() || null;
    if (!name) return json({ ok: false, error: 'Name required' }, { status: 400 });

    // Check for duplicate name (case-insensitive) - SQLite doesn't support mode: 'insensitive'
    const allOrgs = await prisma.organization.findMany({ select: { name: true } });
    const existing = allOrgs.find(org => org.name.toLowerCase() === name.toLowerCase());
    if (existing) return json({ ok: false, error: 'Organization name already exists' }, { status: 400 });

    const org = await prisma.organization.create({
      data: {
        name,
        description,
        createdByUserId: user.id,
        status: 'pending',
        memberships: {
          create: {
            userId: user.id,
            role: 'org_admin',
            status: 'pending'
          }
        }
      },
      select: { id: true, name: true, status: true }
    });
    return json({ ok: true, organization: org });
  } catch (error: any) {
    console.error('[POST /api/organizations] error', error);
    return json({ ok: false, error: error?.message || 'Failed to create organization' }, { status: 500 });
  }
};


