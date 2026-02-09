// frontend/src/lib/utils/syncUser.ts
// Find backend user in shared DB by email (no create - backend owns user creation)
import { prisma } from '$lib/db';

/** Return type: id as string for API compatibility. */
export async function ensurePrismaUser(email: string): Promise<{ id: string; role: string } | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const prismaUser = await prisma.user.findFirst({
      where: { username: normalizedEmail },
      select: { id: true, role: true }
    });
    if (!prismaUser) return null;
    if (normalizedEmail === 'jonakfir@gmail.com' && prismaUser.role !== 'admin') {
      await prisma.user.update({
        where: { id: prismaUser.id },
        data: { role: 'admin' }
      });
      return { id: String(prismaUser.id), role: 'admin' };
    }
    return { id: String(prismaUser.id), role: prismaUser.role };
  } catch (error: any) {
    console.error('[ensurePrismaUser] Error:', error);
    return null;
  }
}

