import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';
import { randomBytes } from 'crypto';

/**
 * POST /api/sync-user - Create or update Prisma user from backend user
 * This is called immediately after registration to ensure Prisma user exists
 */
export const POST: RequestHandler = async (event) => {
  try {
    const body = await event.request.json();
    const { email, backendUserId, password } = body;

    if (!email) {
      return json({ ok: false, error: 'Email required' }, { status: 400 });
    }

    // Check if Prisma user already exists by email (username)
    let prismaUser = await prisma.user.findFirst({
      where: {
        username: email
      }
    });

    if (!prismaUser) {
      // Create new Prisma user with 9-digit ID
      const bcrypt = await import('bcryptjs');
      
      // Use provided password if available, otherwise generate default
      // In mock mode, password is provided during registration
      const passwordHash = password 
        ? await bcrypt.hash(password, 10)
        : await bcrypt.hash('temp', 10);

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
          username: email,
          password: passwordHash,
          invitationCode
        }
      });

      console.log('[sync-user] Created Prisma user:', prismaUser.id, 'for email:', email);
    } else {
      // If password is provided and user exists, update password (for mock mode password sync)
      if (password) {
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash(password, 10);
        prismaUser = await prisma.user.update({
          where: { id: prismaUser.id },
          data: { password: passwordHash }
        });
        console.log('[sync-user] Updated Prisma user password for:', email);
      } else {
        console.log('[sync-user] Prisma user already exists:', prismaUser.id, 'for email:', email);
      }
    }

    return json({
      ok: true,
      user: {
        id: prismaUser.id,
        username: prismaUser.username,
        invitationCode: prismaUser.invitationCode
      }
    });
  } catch (error: any) {
    console.error('[POST /api/sync-user] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to sync user' },
      { status: 500 }
    );
  }
};

