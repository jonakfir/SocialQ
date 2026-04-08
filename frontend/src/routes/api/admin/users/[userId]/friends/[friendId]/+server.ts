import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';

/**
 * Get current admin
 */
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  const user = await getAdminUserFromRequest(event.request);
  return user ? { id: user.id } : null;
}

/**
 * DELETE /api/admin/users/[userId]/friends/[friendId] - Remove a friend from user's account
 */
export const DELETE: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userId = event.params.userId;
    const friendId = event.params.friendId;
    
    if (!userId || !friendId) {
      return json({ ok: false, error: 'User ID and Friend ID required' }, { status: 400 });
    }
    
    // Find and delete friendship
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId1: userId, userId2: friendId },
          { userId1: friendId, userId2: userId }
        ]
      }
    });
    
    if (!friendship) {
      return json({ ok: false, error: 'Friendship not found' }, { status: 404 });
    }
    
    await prisma.friendship.delete({
      where: { id: friendship.id }
    });
    
    return json({
      ok: true,
      message: 'Friend removed successfully'
    });
  } catch (error: any) {
    console.error('[DELETE /api/admin/users/[userId]/friends/[friendId]] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to remove friend' },
      { status: 500 }
    );
  }
};

