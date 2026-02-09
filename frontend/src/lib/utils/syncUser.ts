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

/**
 * For uploads (e.g. iOS app): find user by email in frontend DB, or create one using backend userId
 * so the collage can be saved even when frontend and backend use different DBs.
 * Returns { id, role } with id as string for API compatibility.
 */
export async function ensurePrismaUserForUpload(
  backendUserId: number | string,
  email: string
): Promise<{ id: string; role: string } | null> {
  try {
    const normalizedEmail = email?.trim?.()?.toLowerCase?.() || '';
    if (!normalizedEmail) return null;

    const existing = await ensurePrismaUser(normalizedEmail);
    if (existing) return existing;

    const id = typeof backendUserId === 'string' ? parseInt(backendUserId, 10) : backendUserId;
    if (!Number.isInteger(id) || id <= 0) return null;

    const bcrypt = await import('bcryptjs');
    const placeholderHash = await bcrypt.hash('upload-placeholder', 10);

    const created = await prisma.user.create({
      data: {
        id,
        username: normalizedEmail,
        password: placeholderHash,
        role: 'personal'
      },
      select: { id: true, role: true }
    });
    console.log('[ensurePrismaUserForUpload] Created user in frontend DB:', created.id, normalizedEmail);
    return { id: String(created.id), role: created.role };
  } catch (error: any) {
    // If user already exists (e.g. same DB, created by backend), find by id
    if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
      const byId = await prisma.user.findUnique({
        where: { id: typeof backendUserId === 'string' ? parseInt(backendUserId, 10) : backendUserId },
        select: { id: true, role: true }
      });
      if (byId) return { id: String(byId.id), role: byId.role };
    }
    console.error('[ensurePrismaUserForUpload] Error:', error);
    return null;
  }
}

