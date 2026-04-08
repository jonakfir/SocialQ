import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId, toPrismaUserId } from '$lib/userId';
import { env as publicEnv } from '$env/dynamic/public';

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
 * Get current user helper (same as main friends endpoint)
 */
async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    if (mockUserId) {
      return { id: String(mockUserId) };
    }
    
    const cookieHeader = event.request.headers.get('cookie') || '';
    const authHeader = event.request.headers.get('authorization') || '';
    const { PUBLIC_API_URL } = await import('$env/static/public'); const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';

    try {
      const meHeaders: Record<string, string> = { cookie: cookieHeader };
      if (authHeader) meHeaders['Authorization'] = authHeader;
      const response = await fetch(`${backendUrl}/auth/me`, {
        headers: meHeaders
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.id) {
          const userId = String(data.user.id);
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
          
          return { id: String(prismaUser.id) };
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
 * GET /api/friends/requests - Get pending friend requests
 * When PUBLIC_API_URL is set, proxies to Node backend so web and mobile share the same DB.
 */
export const GET: RequestHandler = async (event) => {
  try {
    const base = (publicEnv.PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (base) {
      const res = await proxyToBackend('/relationships/requests', event.request);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ ok: false, error: data?.error || 'Failed to fetch requests' }, { status: res.status });
      }
      const sent = (data.sent || []).map((r: { id?: number; to_user_id?: number; to_user_email?: string; created_at?: string }) => ({
        id: r.id,
        toUserId: r.to_user_id,
        toUsername: r.to_user_email ?? '',
        createdAt: r.created_at
      }));
      const received = (data.received || []).map((r: { id?: number; from_user_id?: number; from_user_email?: string; created_at?: string }) => ({
        id: r.id,
        fromUserId: r.from_user_id,
        fromUsername: r.from_user_email ?? '',
        createdAt: r.created_at
      }));
      return json({ ok: true, sent, received });
    }

    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const uidNum = toPrismaUserId(user.id);
    const [sent, received] = await Promise.all([
      // Sent requests (pending)
      prisma.friendRequest.findMany({
        where: {
          fromUserId: uidNum,
          status: 'pending'
        },
        include: {
          toUser: {
            select: { id: true, username: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      // Received requests (pending)
      prisma.friendRequest.findMany({
        where: {
          toUserId: uidNum,
          status: 'pending'
        },
        include: {
          fromUser: {
            select: { id: true, username: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return json({
      ok: true,
      sent: sent.map(r => ({
        id: r.id,
        toUserId: r.toUserId,
        toUsername: r.toUser.username,
        createdAt: r.createdAt
      })),
      received: received.map(r => ({
        id: r.id,
        fromUserId: r.fromUserId,
        fromUsername: r.fromUser.username,
        createdAt: r.createdAt
      }))
    });
  } catch (error: any) {
    console.error('[GET /api/friends/requests] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch requests' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/friends/requests - Send friend request
 * Body: { toUserId?: string, userEmail?: string, invitationCode?: string }
 * When PUBLIC_API_URL is set, proxies to Node backend so web and mobile share the same DB.
 */
export const POST: RequestHandler = async (event) => {
  try {
    const base = (publicEnv.PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (base) {
      const body = await event.request.json();
      const { toUserId, userEmail } = body;
      const backendBody = toUserId != null ? { toUserId: Number(toUserId) } : userEmail ? { userEmail: String(userEmail).trim() } : null;
      if (!backendBody) {
        return json({ ok: false, error: 'toUserId or userEmail required' }, { status: 400 });
      }
      const res = await proxyToBackend('/relationships/requests', event.request, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendBody)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ ok: false, error: data?.error || 'Failed to send request' }, { status: res.status });
      }
      const req = data.request;
      return json({
        ok: true,
        request: req ? { id: req.id, toUserId: req.to_user_id ?? toUserId, createdAt: req.created_at } : undefined
      });
    }

    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await event.request.json();
    const { toUserId, invitationCode } = body;

    if (!toUserId && !invitationCode) {
      return json({ ok: false, error: 'toUserId or invitationCode required' }, { status: 400 });
    }

    let targetUser: { id: number } | null = null;

    // Find target user by ID or invitation code
    if (toUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: toPrismaUserId(String(toUserId)) },
        select: { id: true }
      });
    } else if (invitationCode) {
      targetUser = await prisma.user.findUnique({
        where: { invitationCode: String(invitationCode).toUpperCase() },
        select: { id: true }
      });
    }

    if (!targetUser) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const uidNum = toPrismaUserId(user.id);
    const targetIdNum = targetUser.id;

    // Can't send request to yourself
    if (targetIdNum === uidNum) {
      return json({ ok: false, error: 'Cannot send request to yourself' }, { status: 400 });
    }
    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId1: uidNum, userId2: targetIdNum },
          { userId1: targetIdNum, userId2: uidNum }
        ]
      }
    });

    if (existingFriendship) {
      return json({ ok: false, error: 'Already friends' }, { status: 400 });
    }

    // Check if reverse request exists (bidirectional auto-accept)
    const reverseRequest = await prisma.friendRequest.findFirst({
      where: {
        fromUserId: targetIdNum,
        toUserId: uidNum,
        status: 'pending'
      }
    });

    if (reverseRequest) {
      // Auto-accept: create friendship and update both requests
      const [userId1, userId2] = [uidNum, targetIdNum].sort((a, b) => a - b);

      await prisma.$transaction([
        prisma.friendship.create({
          data: { userId1, userId2 }
        }),
        prisma.friendRequest.update({
          where: { id: reverseRequest.id },
          data: { status: 'accepted' }
        }),
        prisma.friendRequest.create({
          data: {
            fromUserId: uidNum,
            toUserId: targetIdNum,
            status: 'accepted'
          }
        })
      ]);

      return json({ ok: true, accepted: true, message: 'Friend request accepted automatically' });
    }

    // Check if request already exists
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        fromUserId: uidNum,
        toUserId: targetIdNum,
        status: 'pending'
      }
    });

    if (existingRequest) {
      return json({ ok: false, error: 'Request already sent' }, { status: 400 });
    }

    // Create new request
    const request = await prisma.friendRequest.create({
      data: {
        fromUserId: uidNum,
        toUserId: targetIdNum,
        status: 'pending'
      }
    });

    return json({
      ok: true,
      request: {
        id: request.id,
        toUserId: targetUser.id,
        createdAt: request.createdAt
      }
    });
  } catch (error: any) {
    console.error('[POST /api/friends/requests] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to send request' },
      { status: 500 }
    );
  }
};

