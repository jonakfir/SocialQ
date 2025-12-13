import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * Get current admin
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
 * GET /api/admin/users/[userId]/friends - Get user's friends
 */
export const GET: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userId = event.params.userId;
    if (!userId) {
      return json({ ok: false, error: 'User ID required' }, { status: 400 });
    }
    
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true }
    });
    
    if (!user) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }
    
    // Get friendships
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: userId },
          { userId2: userId }
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
      const friend = f.userId1 === userId ? f.user2 : f.user1;
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
    console.error('[GET /api/admin/users/[userId]/friends] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch friends' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/admin/users/[userId]/friends - Add a friend to user's account
 */
export const POST: RequestHandler = async (event) => {
  try {
    // Admin check is handled by route guard - if user reaches this endpoint, they're already verified as admin
    const userId = event.params.userId;
    if (!userId) {
      return json({ ok: false, error: 'User ID required' }, { status: 400 });
    }
    
    const body = await event.request.json();
    const friendId = body.friendId;
    
    if (!friendId) {
      return json({ ok: false, error: 'Friend ID required' }, { status: 400 });
    }
    
    if (userId === friendId) {
      return json({ ok: false, error: 'Cannot add user as their own friend' }, { status: 400 });
    }
    
    // Verify both users exist
    const [user, friend] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true }
      }),
      prisma.user.findUnique({
        where: { id: friendId },
        select: { id: true, username: true }
      })
    ]);
    
    if (!user || !friend) {
      return json({ ok: false, error: 'User or friend not found' }, { status: 404 });
    }
    
    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId1: userId, userId2: friendId },
          { userId1: friendId, userId2: userId }
        ]
      }
    });
    
    if (existingFriendship) {
      return json({ ok: false, error: 'Friendship already exists' }, { status: 400 });
    }
    
    // Create friendship (ensure userId1 < userId2 for consistency)
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    
    const friendship = await prisma.friendship.create({
      data: {
        userId1: id1,
        userId2: id2
      },
      include: {
        user1: {
          select: { id: true, username: true }
        },
        user2: {
          select: { id: true, username: true }
        }
      }
    });
    
    // Delete any pending friend requests between these users
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: userId }
        ]
      }
    });
    
    // Return the friend object (the other user, not the requesting user)
    const friendUser = friendship.userId1 === userId ? friendship.user2 : friendship.user1;
    
    return json({
      ok: true,
      friend: {
        id: friendUser.id,
        username: friendUser.username,
        friendshipId: friendship.id,
        createdAt: friendship.createdAt
      }
    });
  } catch (error: any) {
    console.error('[POST /api/admin/users/[userId]/friends] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to add friend' },
      { status: 500 }
    );
  }
};

