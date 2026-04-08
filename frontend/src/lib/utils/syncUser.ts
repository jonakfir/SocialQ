// frontend/src/lib/utils/syncUser.ts
// Find backend user in shared DB by email (no create - backend owns user creation)
import { prisma } from '$lib/db';

/**
 * Decode a JWT (without verification) and return its payload, or null on failure.
 * Used as a fallback when the backend /auth/me returns ok but user=null
 * (e.g. after a DB migration where the backend DB was reset but old JWTs are still valid).
 */
export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // atob is available in both Node 18+ and browser
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Shared admin auth helper for SvelteKit API routes.
 * Tries backend /auth/me first; if user is missing from the backend response
 * (e.g. post-migration), falls back to decoding the JWT directly and looking
 * up the user in Prisma by email.
 *
 * Returns { id: string, role: string } or null if unauthenticated.
 */
export async function getAdminUserFromRequest(
  request: Request
): Promise<{ id: string; role: string } | null> {
  try {
    // Mock auth headers (dev / test convenience)
    const mockUserId = request.headers.get('X-User-Id');
    const mockUserEmail = request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    const cookieHeader = request.headers.get('cookie') || '';

    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    let emailFromBackend: string | null = null;

    if (response.ok) {
      const data = await response.json();
      const backendUser = data?.user;
      if (backendUser?.email) {
        emailFromBackend = backendUser.email;
      } else if (backendUser?.username) {
        emailFromBackend = backendUser.username;
      }
    }

    // Fallback: decode JWT to get email if backend returned user=null
    // (happens when backend DB was reset/migrated but old tokens are still valid)
    if (!emailFromBackend && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const payload = decodeJwtPayload(token);
      // JWT payload uses 'un' (username/email) or 'email'
      emailFromBackend = payload?.un || payload?.email || null;
    }

    if (!emailFromBackend) return null;

    return await ensurePrismaUser(emailFromBackend);
  } catch (error) {
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

