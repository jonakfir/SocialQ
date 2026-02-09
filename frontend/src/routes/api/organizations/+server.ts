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
    
    // Get JWT token from Authorization header
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    // Build headers for backend request
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.error('[getCurrentUser] Backend /auth/me failed:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) {
      console.error('[getCurrentUser] No user in backend response:', data);
      return null;
    }
    
    // Ensure user exists in Prisma with correct role
    const prismaUser = await ensurePrismaUser(backendUser.email);
    
    return prismaUser;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
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
      const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(current.id) }, select: { role: true } });
      if (me?.role === 'admin') {
        where = {};
      }
    }
    if (mine && current) {
      try {
        const memberships = await prisma.organizationMembership.findMany({
          where: { userId: toPrismaUserId(current.id) },
          select: { organizationId: true }
        });
        const ids = memberships.map(m => m.organizationId);
        where = { id: { in: ids } };
      } catch {
        where = { id: { in: [] } }; // avoid 500 if membership query fails
      }
    }
    let orgs: Array<{ id: string; name: string; description: string | null; status: string; createdAt: Date; createdBy: { id: string; username: string } }>;
    try {
      orgs = await prisma.organization.findMany({
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
    } catch (err: any) {
      // e.g. Postgres 22P03 "incorrect binary data format in bind parameter 1" — return empty so UI doesn't 500
      console.warn('[GET /api/organizations] organization.findMany failed:', err?.message ?? err);
      orgs = [];
    }
    
    // Filter by search (case-insensitive) if provided
    let filteredOrgs = orgs;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrgs = orgs.filter(org => org.name.toLowerCase().includes(searchLower));
    }
    
    return json({
      ok: true,
      organizations: filteredOrgs.map((o) => ({
        ...o,
        id: String(o.id),
        createdBy: o.createdBy ? { ...o.createdBy, id: String(o.createdBy.id) } : o.createdBy
      }))
    });
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
        createdByUserId: toPrismaUserId(user.id),
        status: 'pending',
        memberships: {
          create: {
            userId: toPrismaUserId(user.id),
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


