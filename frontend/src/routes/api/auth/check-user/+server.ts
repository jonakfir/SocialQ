import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

/**
 * POST /api/auth/check-user - Check if user exists in Prisma (for mock auth validation)
 * This is used by the mock login to verify users are registered
 */
export const POST: RequestHandler = async (event) => {
  try {
    const body = await event.request.json();
    const { email, password } = body;

    if (!email) {
      return json({ ok: false, error: 'Email required' }, { status: 400 });
    }

    // Find user by email (username in Prisma)
    const user = await prisma.user.findFirst({
      where: {
        username: email.trim().toLowerCase()
      },
      select: {
        id: true,
        username: true,
        password: true,
        role: true
      }
    });

    if (!user) {
      return json({ ok: false, exists: false, error: 'User not found' });
    }

    // If password provided, verify it
    if (password) {
      const bcrypt = await import('bcryptjs');
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        return json({ ok: false, exists: true, validPassword: false, error: 'Invalid password' });
      }
    }

    return json({
      ok: true,
      exists: true,
      validPassword: password ? true : undefined,
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'personal'
      }
    });
  } catch (error: any) {
    console.error('[POST /api/auth/check-user] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to check user' },
      { status: 500 }
    );
  }
};

