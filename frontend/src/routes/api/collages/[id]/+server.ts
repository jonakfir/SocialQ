import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_API_URL } from '$env/static/public';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { ensurePrismaUser } from '$lib/utils/syncUser';

/**
 * Get current user from backend API
 * Returns backend user (with numeric id) and creates/finds corresponding Prisma user
 * Also supports mock auth in dev mode via X-User-Id header
 */
async function getCurrentUser(event: { request: Request; cookies: any; fetch: typeof fetch }): Promise<{ id: string; backendId: number } | null> {
  try {
    // Check for mock auth header (set by client when using localStorage mock)
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    // In dev mode with mock auth, use the header
    if (mockUserId && mockUserEmail) {
      const userId = String(mockUserId);
      
      // Find by username (email) since that's our unique identifier
      let prismaUser = await prisma.user.findFirst({
        where: {
          username: mockUserEmail
        }
      });
      
      if (!prismaUser) {
        const bcrypt = await import('bcryptjs');
        const defaultPassword = await bcrypt.hash('temp', 10);
        const { randomBytes } = await import('crypto');
        
        // Generate unique 9-digit user ID
        const newUserId = await generateUserId();
        
        // Generate unique invitation code
        let invitationCode: string;
        let attempts = 0;
        do {
          invitationCode = randomBytes(8).toString('hex').toUpperCase();
          attempts++;
          if (attempts > 10) {
            throw new Error('Failed to generate unique invitation code');
          }
        } while (await prisma.user.findUnique({ where: { invitationCode } }));
        
        prismaUser = await prisma.user.create({
          data: {
            id: newUserId,
            username: mockUserEmail,
            password: defaultPassword,
            invitationCode
          }
        });
      }
      
      return {
        id: prismaUser.id,
        backendId: Number(mockUserId)
      };
    }
    
    // Otherwise, try real backend auth
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const authUrl = base ? `${base}/auth/me` : 'http://localhost:4000/auth/me';
    
    // Get all cookies from the request and forward them
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    // Call backend directly with cookies
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    const backendUser = data?.user || (data?.ok && data?.user !== null) ? data?.user : null;
    
    if (!backendUser || !backendUser.id) {
      return null;
    }
    
    // Backend returns numeric ID, but we need to find/create Prisma user
    const email = backendUser.email || backendUser.username || `user_${backendUser.id}`;
    
    // Find by username (email) since that's our unique identifier
    let prismaUser = await prisma.user.findFirst({
      where: {
        username: email
      }
    });
    
    // If user doesn't exist in Prisma, create it
    if (!prismaUser) {
      const bcrypt = await import('bcryptjs');
      const defaultPassword = await bcrypt.hash('temp', 10);
      const { randomBytes } = await import('crypto');
      
      // Generate unique 9-digit user ID
      const newUserId = await generateUserId();
      
      // Generate unique invitation code
      let invitationCode: string;
      let attempts = 0;
      do {
        invitationCode = randomBytes(8).toString('hex').toUpperCase();
        attempts++;
        if (attempts > 10) {
          throw new Error('Failed to generate unique invitation code');
        }
      } while (await prisma.user.findUnique({ where: { invitationCode } }));
      
      prismaUser = await prisma.user.create({
        data: {
          id: newUserId,
          username: email,
          password: defaultPassword,
          invitationCode
        }
      });
    }
    
    return {
      id: prismaUser.id,
      backendId: Number(backendUser.id)
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * DELETE /api/collages/[id] - Delete a collage
 * Allows admins to delete any collage, or users to delete their own
 */
export const DELETE: RequestHandler = async (event) => {
  try {
    const collageId = event.params.id;
    if (!collageId) {
      return json({ ok: false, error: 'Collage ID required' }, { status: 400 });
    }

    // Check authentication
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

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

