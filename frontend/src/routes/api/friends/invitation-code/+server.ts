import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';
import { randomBytes } from 'crypto';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    if (mockUserId) {
      return { id: String(mockUserId) };
    }
    
    const cookieHeader = event.request.headers.get('cookie') || '';
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';
    
    try {
      const response = await fetch(`${backendUrl}/auth/me`, {
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
          
          return { id: prismaUser.id };
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

function generateInvitationCode(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

/**
 * GET /api/friends/invitation-code - Get or generate user's invitation code
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let prismaUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { invitationCode: true }
    });

    if (!prismaUser?.invitationCode) {
      let code: string;
      let attempts = 0;
      do {
        code = generateInvitationCode();
        attempts++;
        if (attempts > 10) {
          throw new Error('Failed to generate unique invitation code');
        }
      } while (await prisma.user.findUnique({ where: { invitationCode: code } }));

      prismaUser = await prisma.user.update({
        where: { id: user.id },
        data: { invitationCode: code },
        select: { invitationCode: true }
      });
    }

    return json({
      ok: true,
      invitationCode: prismaUser.invitationCode
    });
  } catch (error: any) {
    console.error('[GET /api/friends/invitation-code] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to get invitation code' },
      { status: 500 }
    );
  }
};

