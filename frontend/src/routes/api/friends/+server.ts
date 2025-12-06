import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';
import { randomBytes } from 'crypto';

/**
 * Get current user helper (reused from collages API)
 */
async function getCurrentUser(event: { request: Request; cookies: any; url: URL; fetch: typeof fetch }): Promise<{ id: string; backendId: number } | null> {
  try {
    // Check for mock auth header
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
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
    
    // Try backend auth
    const cookieHeader = event.request.headers.get('cookie') || '';
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';
    const authUrl = `${backendUrl}/auth/me`;
    
    try {
      const response = await fetch(authUrl, {
        headers: { cookie: cookieHeader }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.id) {
          const userId = String(data.user.id);
          // Find by username (email) since that's our unique identifier
          let prismaUser = await prisma.user.findFirst({
            where: {
              username: data.user.email || data.user.username || `user_${userId}`
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
                username: data.user.email || data.user.username || `user_${userId}`,
                password: defaultPassword,
                invitationCode
              }
            });
          }
          
          return {
            id: prismaUser.id,
            backendId: Number(data.user.id)
          };
        }
      }
    } catch {
      // Backend not available
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a unique invitation code
 */
function generateInvitationCode(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Ensure user has an invitation code
 */
async function ensureInvitationCode(userId: string): Promise<string> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: { invitationCode: true }
  });
  
  if (!user?.invitationCode) {
    let code: string;
    let attempts = 0;
    do {
      code = generateInvitationCode();
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique invitation code');
      }
    } while (await prisma.user.findUnique({ where: { invitationCode: code } }));
    
    user = await prisma.user.update({
      where: { id: userId },
      data: { invitationCode: code },
      select: { invitationCode: true }
    });
  }
  
  return user!.invitationCode!;
}

/**
 * GET /api/friends - Get current user's friends
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get friendships where user is either userId1 or userId2
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: user.id },
          { userId2: user.id }
        ]
      },
      include: {
        user1: {
          select: { id: true, username: true }
        },
        user2: {
          select: { id: true, username: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Map to friend objects
    const friends = friendships.map(f => {
      const friend = f.userId1 === user.id ? f.user2 : f.user1;
      return {
        id: friend.id,
        username: friend.username,
        friendshipId: f.id,
        createdAt: f.createdAt
      };
    });

    return json({
      ok: true,
      friends
    });
  } catch (error: any) {
    console.error('[GET /api/friends] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch friends' },
      { status: 500 }
    );
  }
};

