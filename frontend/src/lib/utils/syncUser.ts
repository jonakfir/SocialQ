// frontend/src/lib/utils/syncUser.ts
// Find backend user in shared DB by email (no create - backend owns user creation)
import { prisma } from '$lib/db';

/**
 * Verify the request is from an admin user.
 * Supports JWT Bearer token and cookie auth.
 * Returns the user with role if admin, null otherwise.
 */
export async function getAdminUserFromRequest(request: Request): Promise<{ id: string; role: string } | null> {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const cookieHeader = request.headers.get('cookie') || '';

    // Decode JWT directly if Bearer token present (fast path, no backend call needed)
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const email = payload.un || payload.email || '';
        if (email) {
          const user = await ensurePrismaUser(email.toLowerCase().trim());
          if (user && user.role === 'admin') return user;
        }
      } catch { /* fall through to backend call */ }
    }

    // Fall back to backend /auth/me
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const res = await fetch(`${base}/auth/me`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const email = (data?.user?.email || data?.user?.username || '').toLowerCase().trim();
    if (!email) return null;

    const user = await ensurePrismaUser(email);
    if (user && user.role === 'admin') return user;
    return null;
  } catch (error: any) {
    console.error('[getAdminUserFromRequest] Error:', error);
    return null;
  }
}

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
    // If user already exists (e.g. same DB, created by backend), find by id or by email
    const idNum = typeof backendUserId === 'string' ? parseInt(backendUserId, 10) : backendUserId;
    if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
      const byId = await prisma.user.findUnique({
        where: { id: idNum },
        select: { id: true, role: true }
      });
      if (byId) return { id: String(byId.id), role: byId.role };
    }
    // Also try find by email in case create failed for another reason
    const emailNorm = email?.trim?.()?.toLowerCase?.() || '';
    if (emailNorm) {
      const byEmail = await prisma.user.findFirst({
        where: { username: emailNorm },
        select: { id: true, role: true }
      });
      if (byEmail) return { id: String(byEmail.id), role: byEmail.role };
    }
    console.error('[ensurePrismaUserForUpload] Error:', error);
    return null;
  }
}

