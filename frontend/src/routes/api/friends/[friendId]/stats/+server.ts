import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId, toPrismaUserId } from '$lib/userId';
// Lazy load env

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
 * GET /api/friends/:friendId/stats - Get friend's statistics
 * Validates friendship before allowing access
 * For now, returns basic stats. Can be extended later.
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const friendId = event.params.friendId;
    const userIdNum = toPrismaUserId(user.id);
    const friendIdNum = toPrismaUserId(friendId);

    // Verify friendship exists
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId1: userIdNum, userId2: friendIdNum },
          { userId1: friendIdNum, userId2: userIdNum }
        ]
      }
    });

    if (!friendship) {
      return json({ ok: false, error: 'Friendship not found' }, { status: 403 });
    }

    // Get friend's user info
    const friendUser = await prisma.user.findUnique({
      where: { id: friendIdNum },
      select: {
        id: true,
        username: true,
        createdAt: true
      }
    });

    if (!friendUser) {
      return json({ ok: false, error: 'Friend not found' }, { status: 404 });
    }

    // Count friend's collages
    const collageCount = await prisma.collage.count({
      where: { userId: friendIdNum }
    });

    // For now, return basic stats
    // TODO: Add quiz scores, recognition results, etc. when those are tracked in the database
    return json({
      ok: true,
      stats: {
        username: friendUser.username,
        joinedAt: friendUser.createdAt,
        savedPhotos: collageCount,
        // Placeholder for future stats
        quizScores: null,
        recognitionResults: null
      }
    });
  } catch (error: any) {
    console.error('[GET /api/friends/:friendId/stats] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch friend stats' },
      { status: 500 }
    );
  }
};

