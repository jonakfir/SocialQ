// frontend/src/lib/utils/syncUser.ts
// Helper function to ensure a backend user exists in Prisma with correct role
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';

/** Return type: id as string for API compatibility. */
export async function ensurePrismaUser(email: string): Promise<{ id: string; role: string } | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    let prismaUser = await prisma.user.findFirst({
      where: { username: normalizedEmail },
      select: { id: true, role: true }
    });
    if (prismaUser) {
      if (normalizedEmail === 'jonakfir@gmail.com' && prismaUser.role !== 'admin') {
        await prisma.user.update({
          where: { id: prismaUser.id },
          data: { role: 'admin' }
        });
        prismaUser = { ...prismaUser, role: 'admin' };
      }
      return { id: String(prismaUser.id), role: prismaUser.role };
    }
    const userId = await generateUserId();
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.default.hash('temp', 10);
    const { randomBytes } = await import('crypto');
    let invitationCode: string | undefined;
    let attempts = 0;
    do {
      invitationCode = randomBytes(8).toString('hex').toUpperCase();
      attempts++;
      if (attempts > 10) {
        invitationCode = undefined;
        break;
      }
    } while (await prisma.user.findUnique({ where: { invitationCode } }));
    const isAdmin = normalizedEmail === 'jonakfir@gmail.com';
    const role = isAdmin ? 'admin' : 'personal';
    prismaUser = await prisma.user.create({
      data: {
        id: userId,
        username: normalizedEmail,
        password: defaultPassword,
        role,
        invitationCode: invitationCode || undefined
      },
      select: { id: true, role: true }
    });
    return { id: String(prismaUser.id), role: prismaUser.role };
  } catch (error: any) {
    console.error('[ensurePrismaUser] Error:', error);
    return null;
  }
}

