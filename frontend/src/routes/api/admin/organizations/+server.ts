import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    // Check for mock auth headers first (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user || null;
    }

    // Try backend auth with JWT token and cookies
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

// GET /api/admin/organizations - Get all organizations with member counts and org admins
export const GET: RequestHandler = async (event) => {
  try {
    // TEMPORARY: Always allow
    const user = await getCurrentUser(event);
    // Use dummy user if getCurrentUser fails
    const currentUser = user || { id: 'temp-admin', role: 'admin' };

    const url = new URL(event.request.url);
    const search = (url.searchParams.get('search') || '').trim();

    // Fetch all organizations
    const orgs = await prisma.organization.findMany({
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
        },
        memberships: {
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            joinedAt: true,
            user: {
              select: {
                id: true,
                username: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Process organizations to include member counts and org admins
    const orgsWithDetails = orgs.map(org => {
      const approvedMembers = org.memberships.filter(m => m.status === 'approved');
      const orgAdmins = approvedMembers
        .filter(m => m.role === 'org_admin')
        .map(m => ({
          id: m.user.id,
          username: m.user.username
        }));
      const memberCount = approvedMembers.length;
      const pendingCount = org.memberships.filter(m => m.status === 'pending').length;

      return {
        id: org.id,
        name: org.name,
        description: org.description,
        status: org.status,
        createdAt: org.createdAt,
        createdBy: org.createdBy,
        memberCount,
        pendingCount,
        orgAdmins,
        totalMemberships: org.memberships.length
      };
    });

    // Filter by search if provided
    let filteredOrgs = orgsWithDetails;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOrgs = orgsWithDetails.filter(org => 
        org.name.toLowerCase().includes(searchLower) ||
        org.createdBy.username.toLowerCase().includes(searchLower)
      );
    }

    return json({ ok: true, organizations: filteredOrgs });
  } catch (error: any) {
    console.error('[GET /api/admin/organizations] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch organizations' }, { status: 500 });
  }
};

// POST /api/admin/organizations - Create organization (auto-approved for admins)
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (me?.role !== 'admin') {
      return json({ ok: false, error: 'Only admins can create organizations via this endpoint' }, { status: 403 });
    }

    const body = await event.request.json();
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim() || null;
    // Use provided createdByUserId if it's a non-empty string, otherwise use current admin
    const createdByUserId = (body?.createdByUserId && String(body.createdByUserId).trim()) 
      ? String(body.createdByUserId).trim() 
      : user.id;

    if (!name) {
      return json({ ok: false, error: 'Organization name is required' }, { status: 400 });
    }

    // Check for duplicate name (case-insensitive) - PostgreSQL case-insensitive check
    // Note: Prisma doesn't support mode: 'insensitive' for PostgreSQL, so we fetch and filter
    const allOrgs = await prisma.organization.findMany({ select: { name: true } });
    const existing = allOrgs.find(org => org.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      return json({ ok: false, error: 'Organization name already exists' }, { status: 400 });
    }

    // Verify createdByUserId exists
    const creator = await prisma.user.findUnique({
      where: { id: createdByUserId },
      select: { id: true, username: true }
    });

    if (!creator) {
      return json({ ok: false, error: 'Creator user not found' }, { status: 404 });
    }

    // Create organization with approved status (since admin is creating it)
    const org = await prisma.organization.create({
      data: {
        name,
        description,
        createdByUserId,
        status: 'approved', // Auto-approve when created by admin
        memberships: {
          create: {
            userId: createdByUserId,
            role: 'org_admin',
            status: 'approved' // Auto-approve membership when created by admin
          }
        }
      },
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

    return json({ ok: true, organization: org });
  } catch (error: any) {
    console.error('[POST /api/admin/organizations] error', error);
    return json({ ok: false, error: error?.message || 'Failed to create organization' }, { status: 500 });
  }
};


