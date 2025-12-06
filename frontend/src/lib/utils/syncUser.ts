// frontend/src/lib/utils/syncUser.ts
// Helper function to ensure a backend user exists in Prisma with correct role
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';

export async function ensurePrismaUser(email: string): Promise<{ id: string; role: string } | null> {
  try {
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if user already exists
    let prismaUser = await prisma.user.findFirst({
      where: { username: normalizedEmail },
      select: { id: true, role: true }
    });
    
    // If user exists, return it (but update role if needed for admin)
    if (prismaUser) {
      // Ensure admin role is set correctly for jonakfir@gmail.com
      if (normalizedEmail === 'jonakfir@gmail.com' && prismaUser.role !== 'admin') {
        await prisma.user.update({
          where: { id: prismaUser.id },
          data: { role: 'admin' }
        });
        prismaUser.role = 'admin';
      }
      return prismaUser;
    }
    
    // User doesn't exist, create them
    const userId = await generateUserId();
    const bcrypt = await import('bcryptjs');
    const defaultPassword = await bcrypt.default.hash('temp', 10);
    
    // Generate unique invitation code
    const { randomBytes } = await import('crypto');
    let invitationCode: string | undefined;
    let attempts = 0;
    do {
      invitationCode = randomBytes(8).toString('hex').toUpperCase();
      attempts++;
      if (attempts > 10) {
        invitationCode = undefined; // Skip if can't generate
        break;
      }
    } while (await prisma.user.findUnique({ where: { invitationCode } }));
    
    // Hardcode admin role for jonakfir@gmail.com
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
    
    return prismaUser;
  } catch (error: any) {
    console.error('[ensurePrismaUser] Error:', error);
    return null;
  }
}

