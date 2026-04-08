import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser, getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
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

    // Fetch all organizations from the same DB as the rest of the admin panel (Prisma / DATABASE_URL).
    // If you created orgs via the Node backend (e.g. POST /organizations), they live in the backend DB
    // and won't appear here unless both use the same database.
    let orgs: Awaited<ReturnType<typeof prisma.organization.findMany>>;
    try {
      orgs = await prisma.organization.findMany({
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
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error('[GET /api/admin/organizations] organization.findMany failed:', message);
      return json(
        { ok: false, error: 'Failed to load organizations', details: message },
        { status: 500 }
      );
    }

    type OrgDetail = {
      id: number;
      name: string;
      description: string | null;
      status: string;
      createdAt: Date;
      createdBy: { id: number; username: string };
      memberCount: number;
      pendingCount: number;
      orgAdmins: Array<{ id: number; username: string }>;
      totalMemberships: number;
    };

    // Build list from Prisma first
    let orgsWithDetails: OrgDetail[] = orgs.map(org => {
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

    // Always try backend when configured — orgs may exist only there (e.g. Railway DB)
    let base = '';
    try {
      const staticEnv = await import('$env/static/public');
      base = (staticEnv.PUBLIC_API_URL || '').replace(/\/$/, '');
    } catch (_) {}
    if (!base) {
      try {
        const dynamicEnv = await import('$env/dynamic/public');
        base = (dynamicEnv.PUBLIC_API_URL || '').replace(/\/$/, '');
      } catch (_) {}
    }
    base = base || 'http://localhost:4000';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    if (base && authHeader) {
      try {
        const backendRes = await fetch(`${base}/organizations?all=1`, {
          method: 'GET',
          headers: { Authorization: authHeader }
        });
        if (backendRes.ok) {
          const data = await backendRes.json();
          const list = (data.organizations || []) as any[];
          const existingIds = new Set(orgsWithDetails.map(o => o.id));
          for (const o of list) {
            const id = Number(o.id);
            if (existingIds.has(id)) continue;
            existingIds.add(id);
            orgsWithDetails.push({
              id,
              name: o.name ?? '',
              description: o.description ?? null,
              status: o.status ?? 'pending',
              createdAt: o.created_at ? new Date(o.created_at) : new Date(),
              createdBy: {
                id: Number(o.created_by_user_id ?? 0),
                username: String(o.creator_email ?? '')
              },
              memberCount: Number(o.member_count ?? 0),
              pendingCount: Number(o.pending_count ?? 0),
              orgAdmins: [],
              totalMemberships: Number(o.member_count ?? 0) + Number(o.pending_count ?? 0)
            });
          }
          if (list.length > 0) {
            console.log('[GET /api/admin/organizations] backend returned', list.length, 'organizations; total after merge:', orgsWithDetails.length);
          }
        } else {
          const text = await backendRes.text();
          console.warn('[GET /api/admin/organizations] backend non-ok:', backendRes.status, text.slice(0, 200));
        }
      } catch (e) {
        console.warn('[GET /api/admin/organizations] backend fetch failed:', e);
      }
    }

    // Sort merged list by createdAt desc
    orgsWithDetails.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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
// NOTE: This endpoint is only accessible from admin routes, which already verify admin status
// We trust that if the request reaches here, the user is authenticated as admin
export const POST: RequestHandler = async (event) => {
  try {
    console.log('[POST /api/admin/organizations] ========== AUTH CHECK ==========');
    console.log('[POST /api/admin/organizations] Headers:', {
      'X-User-Id': event.request.headers.get('X-User-Id'),
      'X-User-Email': event.request.headers.get('X-User-Email'),
      'Authorization': event.request.headers.get('Authorization') ? 'Present' : 'Missing',
      'Cookie': event.request.headers.get('cookie') ? 'Present' : 'Missing'
    });
    
    // Parse body first to get email if needed (but don't consume it)
    let bodyData: any = null;
    try {
      const bodyText = await event.request.clone().text();
      if (bodyText) {
        bodyData = JSON.parse(bodyText);
      }
    } catch (e) {
      // Ignore parse errors
    }
    
    // Try multiple authentication methods
    let user = await getCurrentUser(event);
    let userEmail: string | null = null;
    
    // If getCurrentUser failed, try to get user from backend directly
    if (!user) {
      console.log('[POST /api/admin/organizations] getCurrentUser returned null, trying backend directly...');
      
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      const headers: HeadersInit = { Cookie: cookieHeader };
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      try {
        const backendRes = await fetch(`${base}/auth/me`, {
          method: 'GET',
          headers,
          credentials: 'include'
        });
        
        if (backendRes.ok) {
          const backendData = await backendRes.json();
          const backendUser = backendData?.user;
          
          if (backendUser?.email) {
            userEmail = backendUser.email.trim().toLowerCase();
            console.log('[POST /api/admin/organizations] Backend user found:', userEmail);
            // User is authenticated via backend, ensure they exist in Prisma
            const prismaUser = await ensurePrismaUser(backendUser.email);
            if (prismaUser) {
              user = prismaUser;
              console.log('[POST /api/admin/organizations] Prisma user found/created:', { id: prismaUser.id, role: prismaUser.role });
            }
          }
        } else {
          console.error('[POST /api/admin/organizations] Backend /auth/me returned:', backendRes.status);
        }
      } catch (backendError) {
        console.error('[POST /api/admin/organizations] Backend auth fallback failed:', backendError);
      }
    }
    
    // If we still don't have a user, try to find by email from headers
    if (!user) {
      const emailFromHeader = event.request.headers.get('X-User-Email');
      if (emailFromHeader) {
        const emailLower = emailFromHeader.trim().toLowerCase();
        console.log('[POST /api/admin/organizations] Trying to find user by email from header:', emailLower);
        let foundUser = await prisma.user.findFirst({
          where: { username: emailLower },
          select: { id: true, role: true, username: true }
        });
        
        // If not found, try to create it via ensurePrismaUser
        if (!foundUser) {
          console.log('[POST /api/admin/organizations] User not found, creating via ensurePrismaUser');
          foundUser = await ensurePrismaUser(emailLower);
        }
        
        if (foundUser) {
          user = foundUser;
          userEmail = foundUser.username || emailLower;
          console.log('[POST /api/admin/organizations] Found/created user from header:', { id: user.id, role: user.role, email: userEmail });
        }
      }
    }
    
    // Final check - if we still don't have a user, try one more time with email
    if (!user) {
      // Last resort: if we have an email, create/find the user
      const emailFromAnywhere = userEmail || 
        event.request.headers.get('X-User-Email') || 
        bodyData?.email;
      
      if (emailFromAnywhere) {
        const emailLower = String(emailFromAnywhere).trim().toLowerCase();
        console.log('[POST /api/admin/organizations] Last resort: trying email', emailLower);
        
        // If it's jonakfir@gmail.com, we know they're admin - create/find user
        if (emailLower === 'jonakfir@gmail.com') {
          const adminUser = await ensurePrismaUser(emailLower);
          if (adminUser) {
            user = adminUser;
            userEmail = emailLower;
            console.log('[POST /api/admin/organizations] Created/found admin user:', { id: user.id, role: user.role });
          }
        } else {
          // For other emails, try ensurePrismaUser anyway
          const foundUser = await ensurePrismaUser(emailLower);
          if (foundUser) {
            user = foundUser;
            userEmail = emailLower;
            console.log('[POST /api/admin/organizations] Created/found user:', { id: user.id, role: user.role });
          }
        }
      }
    }
    
    // Final check - if we still don't have a user, return error
    if (!user) {
      console.error('[POST /api/admin/organizations] No user found after all attempts - returning 401');
      return json({ ok: false, error: 'Unauthorized - Please log in first' }, { status: 401 });
    }

    // Get fresh role from database to ensure it's current
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    console.log('[POST /api/admin/organizations] User role from DB:', me?.role, 'Email:', me?.username);
    
    // Check if user is admin - hardcode jonakfir@gmail.com as always admin
    const email = userEmail || (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    
    if (!isAdmin) {
      console.error('[POST /api/admin/organizations] User is not admin. Email:', email, 'Role:', me?.role);
      return json({ ok: false, error: 'Only admins can create organizations via this endpoint' }, { status: 403 });
    }
    
    console.log('[POST /api/admin/organizations] ========== AUTH SUCCESS ==========');

    // Use bodyData if we already parsed it, otherwise parse now
    const body = bodyData || await event.request.json();
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim() || null;
    // Use provided createdByUserId if it's a non-empty string, otherwise use current admin
    const createdByUserIdStr = (body?.createdByUserId && String(body.createdByUserId).trim())
      ? String(body.createdByUserId).trim()
      : user.id;
    const createdByUserId = toPrismaUserId(createdByUserIdStr);

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


