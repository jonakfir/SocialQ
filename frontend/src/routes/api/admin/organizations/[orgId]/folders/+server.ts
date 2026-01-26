import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';

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
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    
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
      return null;
    }
    
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) {
      return null;
    }
    
    const prismaUser = await ensurePrismaUser(backendUser.email);
    return prismaUser;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
}

// GET /api/admin/organizations/[orgId]/folders - Get folder settings for an organization
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    
    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can view folder settings' }, { status: 403 });
    }

    const orgId = event.params.orgId;
    if (!orgId) {
      return json({ ok: false, error: 'Organization ID is required' }, { status: 400 });
    }

    // Get organization folder settings
    const folders = await prisma.organizationImageFolder.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        folder: true,
        enabled: true
      }
    });

    // Ensure all three folders exist (with default enabled state)
    const folderTypes = ['ekman', 'synthetic', 'user'];
    const folderMap = new Map(folders.map(f => [f.folder, f]));
    
    const result = folderTypes.map(folderType => {
      const existing = folderMap.get(folderType);
      return {
        folder: folderType,
        enabled: existing?.enabled ?? (folderType === 'ekman') // Default: only ekman enabled
      };
    });

    return json({ ok: true, folders: result });
  } catch (error: any) {
    console.error('[GET /api/admin/organizations/[orgId]/folders] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch folder settings' }, { status: 500 });
  }
};

// POST /api/admin/organizations/[orgId]/folders - Update folder settings for an organization
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    
    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can update folder settings' }, { status: 403 });
    }

    const orgId = event.params.orgId;
    if (!orgId) {
      return json({ ok: false, error: 'Organization ID is required' }, { status: 400 });
    }

    // Verify organization exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true }
    });

    if (!org) {
      return json({ ok: false, error: 'Organization not found' }, { status: 404 });
    }

    const body = await event.request.json();
    const folders = body.folders; // Array of { folder: string, enabled: boolean }

    if (!Array.isArray(folders)) {
      return json({ ok: false, error: 'Folders must be an array' }, { status: 400 });
    }

    // Validate folder types
    const validFolders = ['ekman', 'synthetic', 'user'];
    for (const folder of folders) {
      if (!validFolders.includes(folder.folder)) {
        return json({ ok: false, error: `Invalid folder type: ${folder.folder}` }, { status: 400 });
      }
    }

    // Update or create folder settings
    const updates = folders.map(folder => 
      prisma.organizationImageFolder.upsert({
        where: {
          organizationId_folder: {
            organizationId: orgId,
            folder: folder.folder
          }
        },
        update: {
          enabled: folder.enabled
        },
        create: {
          organizationId: orgId,
          folder: folder.folder,
          enabled: folder.enabled
        }
      })
    );

    await Promise.all(updates);

    // Return updated folder settings
    const updatedFolders = await prisma.organizationImageFolder.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        folder: true,
        enabled: true
      }
    });

    return json({ ok: true, folders: updatedFolders });
  } catch (error: any) {
    console.error('[POST /api/admin/organizations/[orgId]/folders] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update folder settings' }, { status: 500 });
  }
};

