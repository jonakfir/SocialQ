import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId, toPrismaUserId } from '$lib/userId';
// Lazy load env
import { randomBytes } from 'crypto';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    if (mockUserId) return { id: String(mockUserId) };

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const backendUrl = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const cookieHeader = event.request.headers.get('cookie') || '';
    const authHeader = event.request.headers.get('authorization') || '';
    const headers: Record<string, string> = {};
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${backendUrl}/auth/me`, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.user?.id) return null;

    const email = data.user.email || data.user.username;
    const backendId = data.user.id;
    const { ensurePrismaUserForUpload } = await import('$lib/utils/syncUser');
    const prismaUser = await ensurePrismaUserForUpload(backendId, email);
    return prismaUser ? { id: String(prismaUser.id) } : null;
  } catch {
    return null;
  }
}

function generateInvitationCode(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * GET /api/friends/invitation-code - Get user's invitation code (derived from user ID)
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Derive a stable invitation code from the user's numeric ID
    // This is deterministic so no DB column needed
    const crypto = await import('crypto');
    const code = crypto.createHash('sha256')
      .update(`invite-${user.id}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    return json({ ok: true, invitationCode: code, code });
  } catch (error: any) {
    console.error('[GET /api/friends/invitation-code] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to get invitation code' },
      { status: 500 }
    );
  }
};

