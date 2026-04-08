import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
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
 * POST /api/friends/requests/:requestId/decline - Decline friend request
 * When PUBLIC_API_URL is set, proxies to Node backend so web and mobile share the same DB.
 */
export const POST: RequestHandler = async (event) => {
  try {
    const requestId = event.params.requestId;
    const base = (publicEnv.PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (base) {
      const res = await proxyToBackend(`/relationships/requests/${requestId}/decline`, event.request, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ ok: false, error: data?.error || 'Failed to decline request' }, { status: res.status });
      }
      return json({ ok: true, message: 'Friend request declined' });
    }

    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      return json({ ok: false, error: 'Request not found' }, { status: 404 });
    }

    const { toPrismaUserId } = await import('$lib/userId');
    if (request.toUserId !== toPrismaUserId(user.id)) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (request.status !== 'pending') {
      return json({ ok: false, error: 'Request already processed' }, { status: 400 });
    }

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'declined' }
    });

    return json({ ok: true, message: 'Friend request declined' });
  } catch (error: any) {
    console.error('[POST /api/friends/requests/:requestId/decline] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to decline request' },
      { status: 500 }
    );
  }
};

