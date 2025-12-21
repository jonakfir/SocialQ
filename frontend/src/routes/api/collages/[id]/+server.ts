import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_API_URL } from '$env/static/public';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { ensurePrismaUser } from '$lib/utils/syncUser';

/**
 * Get current user from backend API
 * Returns Prisma user with proper admin role checking
 * Also supports mock auth in dev mode via X-User-Id header
 */
async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    // Check for mock auth headers first (dev mode)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const prismaUser = await ensurePrismaUser(mockUserEmail);
      return prismaUser;
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

/**
 * DELETE /api/collages/[id] - Delete a collage
 * Allows admins to delete any collage, or users to delete their own
 */
export const DELETE: RequestHandler = async (event) => {
  try {
    console.log('[DELETE /api/collages/[id]] ========== AUTH CHECK ==========');
    const collageId = event.params.id;
    if (!collageId) {
      return json({ ok: false, error: 'Collage ID required' }, { status: 400 });
    }

    // Check authentication with multiple fallbacks
    let user = await getCurrentUser(event);
    
    // If getCurrentUser failed, try backend directly
    if (!user) {
      console.log('[DELETE /api/collages/[id]] getCurrentUser returned null, trying backend directly...');
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
            console.log('[DELETE /api/collages/[id]] Backend user found:', backendUser.email);
            const prismaUser = await ensurePrismaUser(backendUser.email);
            if (prismaUser) {
              user = prismaUser;
              console.log('[DELETE /api/collages/[id]] Prisma user found/created:', { id: user.id, role: user.role });
            }
          }
        }
      } catch (backendError) {
        console.error('[DELETE /api/collages/[id]] Backend auth fallback failed:', backendError);
      }
    }
    
    if (!user) {
      console.error('[DELETE /api/collages/[id]] No user found after all attempts - returning 401');
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database to ensure it's current
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, username: true } });
    console.log('[DELETE /api/collages/[id]] User role from DB:', me?.role, 'Email:', me?.username);
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    console.log('[DELETE /api/collages/[id]] Is admin:', isAdmin);

    // Find the collage
    const collage = await prisma.collage.findUnique({
      where: { id: collageId }
    });

    if (!collage) {
      return json({ ok: false, error: 'Collage not found' }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (!isAdmin && collage.userId !== user.id) {
      return json({ ok: false, error: 'Forbidden - You can only delete your own photos' }, { status: 403 });
    }

    // Note: Images are stored as base64 in the database, so no file deletion needed
    // If we were storing files, we'd delete them here

    // Delete from database
    await prisma.collage.delete({
      where: { id: collageId }
    });

    return json({ ok: true });
  } catch (error: any) {
    console.error('[DELETE /api/collages/[id]] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to delete collage' },
      { status: 500 }
    );
  }
};

/**
 * PATCH /api/collages/[id] - Update collage metadata (e.g., folder)
 * Body: { folder?: string }
 */
export const PATCH: RequestHandler = async (event) => {
  try {
    const collageId = event.params.id;
    if (!collageId) return json({ ok: false, error: 'Collage ID required' }, { status: 400 });
    const user = await getCurrentUser(event);
    if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await event.request.json().catch(() => ({}));
    const folder = typeof body?.folder === 'string' ? body.folder.trim() : undefined;
    if (!folder || folder.length === 0) {
      return json({ ok: false, error: 'Folder name required' }, { status: 400 });
    }

    const collage = await prisma.collage.findUnique({ where: { id: collageId } });
    if (!collage) return json({ ok: false, error: 'Not found' }, { status: 404 });
    if (collage.userId !== user.id) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const updated = await prisma.collage.update({
      where: { id: collageId },
      data: { folder }
    });
    return json({ ok: true, collage: { id: updated.id, folder: updated.folder || 'Me' } });
  } catch (error: any) {
    console.error('[PATCH /api/collages/[id]] error:', error);
    return json({ ok: false, error: error?.message || 'Failed to update collage' }, { status: 500 });
  }
};

