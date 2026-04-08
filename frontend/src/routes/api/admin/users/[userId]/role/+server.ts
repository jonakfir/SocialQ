import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  const user = await getAdminUserFromRequest(event.request);
  return user ? { id: user.id } : null;
}

/**
 * PATCH /api/admin/users/[userId]/role - Update user role
 * Admin only
 * Body: { role: "admin" | "personal" }
 */
export const PATCH: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    // Parse the incoming route param as an integer for Prisma (User.id is Int)
    const userIdParam = event.params.userId;
    const userId = Number(userIdParam);
    const body = await event.request.json();
    const { role } = body;
    
    if (!Number.isInteger(userId)) {
      return json({ ok: false, error: 'Valid numeric user ID required' }, { status: 400 });
    }
    
    if (role !== 'admin' && role !== 'personal') {
      return json({ ok: false, error: 'Invalid role. Must be "admin" or "personal"' }, { status: 400 });
    }
    
    // Check if this is the last admin being downgraded
    if (role === 'personal') {
      const currentUser = await prisma.user.findUnique({
      where: { id: userId },
        select: { role: true }
      });
      
      if (currentUser?.role === 'admin') {
        const adminCount = await prisma.user.count({ where: { role: 'admin' } });
        if (adminCount <= 1) {
          return json({ 
            ok: false, 
            error: 'Cannot downgrade last admin user. Please assign another admin first.' 
          }, { status: 400 });
        }
      }
    }
    
    // FIRST: Update backend PostgreSQL database (this is what login uses)
    // This MUST succeed for login to work correctly
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      // Get user email from Prisma to find in backend
      const prismaUser = await prisma.user.findUnique({
      where: { id: userId },
        select: { username: true }
      });
      
      if (prismaUser) {
        // Get all backend users to find the matching one by email
        const backendUsersResponse = await fetch(`${base}/admin/users`, {
          method: 'GET',
          headers: { 'Cookie': cookieHeader },
          credentials: 'include'
        });
        
        if (backendUsersResponse.ok) {
          const backendData = await backendUsersResponse.json();
          if (backendData.ok && backendData.users) {
            // Find backend user by email
            const backendUser = backendData.users.find((u: any) => 
              (u.email || u.username || '').toLowerCase() === prismaUser.username.toLowerCase()
            );
            
            if (backendUser) {
              // Update backend PostgreSQL via backend API
              // Pass Authorization header if available (for JWT auth)
              const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
              const headers: Record<string, string> = { 
                'Content-Type': 'application/json',
                'Cookie': cookieHeader
              };
              if (authHeader) {
                headers['Authorization'] = authHeader;
              }
              
              const backendResponse = await fetch(`${base}/admin/users/${backendUser.id}/role`, {
                method: 'PATCH',
                headers,
                credentials: 'include',
                body: JSON.stringify({ role, email: prismaUser.username })
              });
              
              if (!backendResponse.ok) {
                const errorText = await backendResponse.text();
                console.error('[PATCH /api/admin/users/[userId]/role] Backend role update failed:', errorText);
                throw new Error(`Backend role update failed: ${errorText}`);
              } else {
                console.log('[PATCH /api/admin/users/[userId]/role] ✅ Backend role updated successfully');
              }
            } else {
              console.warn('[PATCH /api/admin/users/[userId]/role] Backend user not found for email:', prismaUser.username);
              // Don't throw - user might not exist in backend yet
            }
          }
        } else {
          console.warn('[PATCH /api/admin/users/[userId]/role] Failed to fetch backend users');
        }
      }
    } catch (backendError) {
      console.error('[PATCH /api/admin/users/[userId]/role] ❌ Failed to update backend:', backendError);
      // Don't throw - we'll still update Prisma, but log the error
    }
    
    // SECOND: Update Prisma database (for frontend features).
    // If this fails for any reason, log it but don't block the backend role change.
    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: {
          id: true,
          username: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      return json({
        ok: true,
        user: updatedUser
      });
    } catch (prismaError: any) {
      console.error('[PATCH /api/admin/users/[userId]/role] Prisma update failed, but backend role was updated:', prismaError);
      return json({
        ok: true,
        // Minimal payload so the UI can proceed even if Prisma is out of sync
        user: {
          id: userId,
          role
        },
        prismaSyncWarning: prismaError?.message || 'Prisma user update failed; backend role updated only'
      });
    }
  } catch (error: any) {
    console.error('[PATCH /api/admin/users/[userId]/role] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to update user role' },
      { status: 500 }
    );
  }
};
