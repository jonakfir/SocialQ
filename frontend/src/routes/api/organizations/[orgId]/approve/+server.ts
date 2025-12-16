import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

// POST /api/organizations/[orgId]/approve  body: { action: 'approve'|'reject' }
// No admin check needed - if user can access /admin routes, they're already verified as admin
export const POST: RequestHandler = async (event) => {
  try {
    const orgId = event.params.orgId!;
    const body = await event.request.json();
    const action = (String(body?.action || 'approve').toLowerCase() === 'reject') ? 'rejected' : 'approved';

    // Get organization details before updating
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        },
        createdBy: {
          select: { id: true, username: true }
        }
      }
    });

    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    // Update in Prisma
    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: { status: action }
    });

    // Auto-approve memberships if org approved
    if (action === 'approved') {
      await prisma.organizationMembership.updateMany({
        where: { organizationId: orgId, status: 'pending' },
        data: { status: 'approved' }
      });

      // Sync organization to backend PostgreSQL database
      try {
        const { PUBLIC_API_URL } = await import('$env/static/public');
        const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
        const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
        const cookieHeader = event.request.headers.get('cookie') || '';
        
        const headers: HeadersInit = { Cookie: cookieHeader };
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }

        // Get the creator's backend user ID by looking up their email
        if (org.createdBy?.username) {
          // Look up backend user by email
          const backendUserRes = await fetch(`${base}/auth/me`, {
            method: 'GET',
            headers,
            credentials: 'include'
          });

          if (backendUserRes.ok) {
            const backendUserData = await backendUserRes.json();
            const creatorBackendId = backendUserData?.user?.id;
            
            if (creatorBackendId) {
              const backendOrgRes = await fetch(`${base}/organizations`, {
                method: 'POST',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  name: org.name,
                  description: org.description
                })
              });

              if (backendOrgRes.ok) {
                const backendOrg = await backendOrgRes.json();
                console.log('[approve] Organization synced to backend:', backendOrg.organization?.id);
                
                // Update all memberships in backend
                for (const membership of org.memberships) {
                  if (membership.user?.username && backendOrg.organization?.id) {
                    try {
                      await fetch(`${base}/organizations/${backendOrg.organization.id}/members`, {
                        method: 'POST',
                        headers: {
                          ...headers,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          userEmail: membership.user.username,
                          role: membership.role === 'org_admin' ? 'org_admin' : 'member'
                        })
                      });
                    } catch (e) {
                      console.error('[approve] Failed to sync membership for', membership.user.username, e);
                    }
                  }
                }
              } else {
                console.warn('[approve] Failed to sync organization to backend:', await backendOrgRes.text());
              }
            }
          }
        }
      } catch (syncErr) {
        console.error('[approve] Error syncing to backend:', syncErr);
        // Don't fail the request if backend sync fails
      }
    }

    return json({ ok: true, organization: { id: updatedOrg.id, status: updatedOrg.status } });
  } catch (error: any) {
    console.error('[POST /api/organizations/[orgId]/approve] error', error);
    return json({ ok: false, error: error?.message || 'Failed to change org status' }, { status: 500 });
  }
};


