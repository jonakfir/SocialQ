import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';

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
          // Don't use ID lookup anymore since we're letting Prisma generate unique IDs
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

/**
 * GET /api/friends/search?email=... - Search users by email
 */
export const GET: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const email = event.url.searchParams.get('email');
    const userId = event.url.searchParams.get('userId');
    
    // Search by email or user ID
    if (!email && !userId) {
      return json({ ok: true, users: [] });
    }
    
    if (email && email.trim().length < 2 && !userId) {
      return json({ ok: true, users: [] });
    }

    const searchTerm = email ? email.trim().toLowerCase() : '';
    const searchUserId = userId ? userId.trim() : '';
    console.log(`[friends/search] Searching for email: "${searchTerm}" or userId: "${searchUserId}"`);

    // Get current user's friends and pending requests to exclude
    const [friendships, sentRequests, receivedRequests] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          OR: [
            { userId1: user.id },
            { userId2: user.id }
          ]
        },
        select: {
          userId1: true,
          userId2: true
        }
      }),
      prisma.friendRequest.findMany({
        where: {
          fromUserId: user.id,
          status: 'pending'
        },
        select: { toUserId: true }
      }),
      prisma.friendRequest.findMany({
        where: {
          toUserId: user.id,
          status: 'pending'
        },
        select: { fromUserId: true }
      })
    ]);

    // Collect all user IDs to exclude
    const excludeIds = new Set<string>([user.id]);
    friendships.forEach(f => {
      excludeIds.add(f.userId1 === user.id ? f.userId2 : f.userId1);
    });
    sentRequests.forEach(r => excludeIds.add(r.toUserId));
    receivedRequests.forEach(r => excludeIds.add(r.fromUserId));
    
    console.log(`[friends/search] Excluding ${excludeIds.size} user IDs:`, Array.from(excludeIds));
    
    // Debug: Check if the user exists in the database
    const allUsersCheck = await prisma.user.findMany({
      select: { id: true, username: true }
    });
    console.log(`[friends/search] Total users in database: ${allUsersCheck.length}`);
    const matchingUser = allUsersCheck.find(u => u.username.toLowerCase().includes(searchTerm));
    if (matchingUser) {
      console.log(`[friends/search] Found matching user:`, matchingUser);
      if (excludeIds.has(matchingUser.id)) {
        console.log(`[friends/search] User is excluded because they're a friend or have pending request`);
      }
    } else {
      console.log(`[friends/search] No user found matching "${searchTerm}" in database`);
    }

    // Search users by email or user ID
    let users: Array<{ id: string; username: string }> = [];
    
    if (searchUserId) {
      // Search by exact user ID (9-digit number)
      // Check if it's not in the exclude list
      if (!excludeIds.has(searchUserId)) {
        const userById = await prisma.user.findUnique({
          where: {
            id: searchUserId
          },
          select: {
            id: true,
            username: true
          }
        });
        
        if (userById) {
          users = [userById];
        }
      }
    } else if (searchTerm) {
      // Search by email (case-insensitive, partial match)
      // SQLite doesn't support mode: 'insensitive', so we'll fetch all users and filter in JS
      // First try exact match (most common case)
      let foundUsers = await prisma.user.findMany({
        where: {
          id: {
            notIn: Array.from(excludeIds)
          },
          username: {
            contains: searchTerm
          }
        },
        select: {
          id: true,
          username: true
        },
        take: 10
      });

      // If no results with contains (case-sensitive), fetch more and filter in JS
      if (foundUsers.length === 0) {
        const allUsers = await prisma.user.findMany({
          where: {
            id: {
              notIn: Array.from(excludeIds)
            }
          },
          select: {
            id: true,
            username: true
          },
          take: 200 // Get more users to search through
        });

        // Filter for case-insensitive partial match
        foundUsers = allUsers
          .filter(u => u.username.toLowerCase().includes(searchTerm))
          .slice(0, 10)
          .sort((a, b) => a.username.localeCompare(b.username));
      } else {
        // Sort the results
        foundUsers = foundUsers.sort((a, b) => a.username.localeCompare(b.username));
      }
      
      users = foundUsers;
    }

    console.log(`[friends/search] Search for "${searchTerm}" found ${users.length} users`);
    
    return json({
      ok: true,
      users: users.map(u => ({
        id: u.id,
        username: u.username
      }))
    });
  } catch (error: any) {
    console.error('[GET /api/friends/search] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to search users' },
      { status: 500 }
    );
  }
};

