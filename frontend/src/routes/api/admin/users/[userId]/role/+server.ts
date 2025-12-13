import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current user and check if admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      if (user && user.role === 'admin') return { id: user.id };
      return null;
    }
    
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { 'Cookie': cookieHeader },
      credentials: 'include'
    });
    
    const data = await response.json();
    const backendUser = data?.user;
    
    if (!backendUser || !backendUser.id) {
      return null;
    }
    
    const email = backendUser.email || backendUser.username;
    const prismaUser = await prisma.user.findFirst({
      where: { username: email },
      select: { id: true, role: true }
    });
    
    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/admin/users/[userId]/role - Update user role
 * Admin only
 * Body: { role: "admin" | "personal" }
 */
export const PATCH: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userId = event.params.userId;
    const body = await event.request.json();
    const { role } = body;
    
    if (!userId) {
      return json({ ok: false, error: 'User ID required' }, { status: 400 });
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
              const backendResponse = await fetch(`${base}/admin/users/${backendUser.id}/role`, {
                method: 'PATCH',
                headers: { 
                  'Content-Type': 'application/json',
                  'Cookie': cookieHeader
                },
                credentials: 'include',
                body: JSON.stringify({ role, email: prismaUser.username })
              });
              
              if (!backendResponse.ok) {
                console.warn('[PATCH /api/admin/users/[userId]/role] Backend role update failed:', await backendResponse.text());
              } else {
                console.log('[PATCH /api/admin/users/[userId]/role] Backend role updated successfully');
              }
            } else {
              console.warn('[PATCH /api/admin/users/[userId]/role] Backend user not found for email:', prismaUser.username);
            }
          }
        }
      }
    } catch (backendError) {
      console.warn('[PATCH /api/admin/users/[userId]/role] Failed to update backend, continuing with Prisma only:', backendError);
    }
    
    // SECOND: Update Prisma database (for frontend features)
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
  } catch (error: any) {
    console.error('[PATCH /api/admin/users/[userId]/role] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to update user role' },
      { status: 500 }
    );
  }
};
