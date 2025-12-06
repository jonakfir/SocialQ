import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';

// Reuse the same admin check pattern as analytics endpoint
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

// GET /api/admin/users - List users for admin tools (supports simple search + limit)
export const GET: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const url = new URL(event.request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1000);
    const search = (url.searchParams.get('search') || '').trim();

    // SQLite doesn't support mode: 'insensitive', so we'll fetch and filter in JS
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit * 2 // Fetch more to account for filtering
    });

    // Filter by search (case-insensitive) if provided
    let filteredUsers = users;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = users.filter(user => 
        user.username.toLowerCase().includes(searchLower) || 
        user.id.toLowerCase().includes(searchLower)
      ).slice(0, limit); // Apply limit after filtering
    } else {
      filteredUsers = users.slice(0, limit);
    }

    return json({ ok: true, users: filteredUsers });
  } catch (error: any) {
    console.error('[GET /api/admin/users] error:', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch users' }, { status: 500 });
  }
};

// POST /api/admin/users - Create a new user (email, password, role)
export const POST: RequestHandler = async (event) => {
  try {
    const admin = await getCurrentAdmin(event);
    if (!admin) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const body = await event.request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '').trim();
    const role = (String(body?.role || 'personal').trim().toLowerCase() === 'admin') ? 'admin' : 'personal';

    if (!email || !password) {
      return json({ ok: false, error: 'Email and password are required' }, { status: 400 });
    }

    // Reject duplicates
    const existing = await prisma.user.findUnique({ where: { username: email } });
    if (existing) {
      return json({ ok: false, error: 'User already exists' }, { status: 400 });
    }

    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);

    // Generate unique 9-digit user ID
    const id = await generateUserId();

    // Generate unique invitation code
    const { randomBytes } = await import('crypto');
    let invitationCode: string;
    let attempts = 0;
    do {
      invitationCode = randomBytes(8).toString('hex').toUpperCase();
      attempts++;
      if (attempts > 10) {
        return json({ ok: false, error: 'Failed to generate unique invitation code' }, { status: 500 });
      }
    } while (await prisma.user.findUnique({ where: { invitationCode } }));

    const user = await prisma.user.create({
      data: {
        id,
        username: email,
        password: hashed,
        role,
        invitationCode
      },
      select: { id: true, username: true, role: true, createdAt: true }
    });

    return json({ ok: true, user });
  } catch (error: any) {
    console.error('[POST /api/admin/users] error:', error);
    return json({ ok: false, error: error?.message || 'Failed to create user' }, { status: 500 });
  }
};
