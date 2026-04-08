import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { toPrismaUserId } from '$lib/userId';
import { generateUserId } from '$lib/userId';
import { env as publicEnv } from '$env/dynamic/public';
// Lazy load env
import { randomBytes } from 'crypto';

/** Forward request to Node backend with same auth; return response. */
async function proxyToBackend(path: string, request: Request, init?: RequestInit): Promise<Response> {
  const base = (publicEnv.PUBLIC_API_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('PUBLIC_API_URL not set');
  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
  const headers = new Headers(init?.headers);
  request.headers.forEach((v, k) => {
    if (k.toLowerCase() === 'authorization' || k.toLowerCase() === 'cookie') headers.set(k, v);
  });
  return fetch(url, { ...init, headers });
}

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
        id: String(prismaUser.id),
        backendId: Number(mockUserId)
      };
    }
    
    // Try backend auth
    const cookieHeader = event.request.headers.get('cookie') || '';
    const authHeader = event.request.headers.get('authorization') || '';
    const { PUBLIC_API_URL } = await import('$env/static/public'); const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';
    const authUrl = `${backendUrl}/auth/me`;

    try {
      const meHeaders: Record<string, string> = { cookie: cookieHeader };
      if (authHeader) meHeaders['Authorization'] = authHeader;
      const response = await fetch(authUrl, {
        headers: meHeaders
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
            id: String(prismaUser.id),
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
  const uidNum = toPrismaUserId(userId);
  let user = await prisma.user.findUnique({
    where: { id: uidNum },
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
      where: { id: uidNum },
      data: { invitationCode: code },
      select: { invitationCode: true }
    });
  }
  
  return user!.invitationCode!;
}

/**
 * GET /api/friends - Get current user's friends
 * When PUBLIC_API_URL is set, proxies to Node backend so web and mobile share the same DB.
 */
export const GET: RequestHandler = async (event) => {
  try {
    const base = (publicEnv.PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (base) {
      const res = await proxyToBackend('/relationships/friends', event.request);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ ok: false, error: data?.error || 'Failed to fetch friends' }, { status: res.status });
      }
      const friendships = data.friendships || [];
      const friends = friendships.map((f: { friend_id?: number; friend_email?: string; id?: number; created_at?: string }) => ({
        id: String(f.friend_id ?? ''),
        username: f.friend_email ?? '',
        friendshipId: f.id,
        createdAt: f.created_at
      }));
      return json({ ok: true, friends });
    }

    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uidNum = toPrismaUserId(user.id);
    // Get friendships where user is either userId1 or userId2
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: uidNum },
          { userId2: uidNum }
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
      const friend = f.userId1 === uidNum ? f.user2 : f.user1;
      return {
        id: String(friend.id),
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

