import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { ensurePrismaUser } from '$lib/utils/syncUser';

// Reuse the same admin check pattern as analytics endpoint
async function getCurrentAdmin(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');

    if (mockUserId && mockUserEmail) {
      const email = mockUserEmail.trim().toLowerCase();
      // HARDCODE: jonakfir@gmail.com is ALWAYS admin
      if (email === 'jonakfir@gmail.com') {
        const user = await ensurePrismaUser(email);
        return user ? { id: user.id } : null;
      }
      const user = await prisma.user.findFirst({
        where: { username: email },
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

    // HARDCODE: jonakfir@gmail.com is ALWAYS admin - bypass all checks
    const email = (backendUser.email || backendUser.username || '').trim().toLowerCase();
    if (email === 'jonakfir@gmail.com') {
      const user = await ensurePrismaUser(email);
      return user ? { id: user.id } : null;
    }

    // For other users, check Prisma role
    const prismaUser = await ensurePrismaUser(email);
    if (prismaUser && prismaUser.role === 'admin') return { id: prismaUser.id };
    return null;
  } catch (error) {
    console.error('[getCurrentAdmin] Error:', error);
    // If everything fails but email is jonakfir@gmail.com, still allow
    try {
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
      const email = (backendUser?.email || backendUser?.username || '').trim().toLowerCase();
      if (email === 'jonakfir@gmail.com') {
        return { id: 'admin-override' }; // Temporary ID for hardcoded admin
      }
    } catch {}
    return null;
  }
}

// GET /api/admin/users - List users for admin tools (supports simple search + limit)
export const GET: RequestHandler = async (event) => {
  try {
    // ULTRA SIMPLE: Check backend /auth/me FIRST - if it returns jonakfir@gmail.com, ALWAYS allow
    let allowAccess = false;
    
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      // Forward ALL cookies from the incoming request
      const allHeaders: Record<string, string> = {};
      if (cookieHeader) {
        allHeaders['Cookie'] = cookieHeader;
      }
      const origin = event.request.headers.get('origin');
      const referer = event.request.headers.get('referer');
      if (origin) allHeaders['Origin'] = origin;
      if (referer) allHeaders['Referer'] = referer;
      
      const response = await fetch(`${base}/auth/me`, {
        method: 'GET',
        headers: allHeaders,
        credentials: 'include'
      });
      
      const data = await response.json().catch(() => ({}));
      const backendUser = data?.user;
      const email = (backendUser?.email || backendUser?.username || '').trim().toLowerCase();
      
      // HARDCODE: If email is jonakfir@gmail.com, ALWAYS allow
      if (email === 'jonakfir@gmail.com') {
        allowAccess = true;
      }
    } catch (e) {
      console.error('[GET /api/admin/users] Backend check failed:', e);
    }
    
    // Also check mock headers (dev mode)
    if (!allowAccess) {
      const mockEmail = event.request.headers.get('X-User-Email');
      if (mockEmail && mockEmail.trim().toLowerCase() === 'jonakfir@gmail.com') {
        allowAccess = true;
      }
    }
    
    // If still not allowed, try getCurrentAdmin (has its own hardcoded check)
    if (!allowAccess) {
      try {
        const admin = await getCurrentAdmin(event);
        if (admin) {
          allowAccess = true;
        }
      } catch (e) {
        console.error('[GET /api/admin/users] getCurrentAdmin error:', e);
      }
    }
    
    // FINAL CHECK: If still not allowed, BLOCK
    if (!allowAccess) {
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    // Ensure user exists in Prisma
    await ensurePrismaUser('jonakfir@gmail.com');

    // Sync users from backend PostgreSQL to Prisma first
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      // Get all users from backend
      const backendResponse = await fetch(`${base}/admin/users`, {
        method: 'GET',
        headers: { 'Cookie': cookieHeader },
        credentials: 'include'
      });
      
      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        if (backendData.ok && backendData.users) {
          // Sync each backend user to Prisma using helper function
          for (const backendUser of backendData.users) {
            const email = backendUser.email || backendUser.username;
            await ensurePrismaUser(email);
          }
        }
      }
    } catch (syncError) {
      console.warn('[GET /api/admin/users] Failed to sync from backend, using Prisma only:', syncError);
    }

    const url = new URL(event.request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1000);
    const search = (url.searchParams.get('search') || '').trim();

    // Fetch users from Prisma (now synced with backend)
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
    // ULTRA SIMPLE: Check backend /auth/me FIRST - if it returns jonakfir@gmail.com, ALWAYS allow
    let allowAccess = false;
    
    try {
      const { PUBLIC_API_URL } = await import('$env/static/public');
      const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
      const cookieHeader = event.request.headers.get('cookie') || '';
      
      console.log('[POST /api/admin/users] Checking backend auth:', { 
        base, 
        hasCookies: !!cookieHeader, 
        cookieLength: cookieHeader.length,
        cookiePreview: cookieHeader.substring(0, 100) 
      });
      
      // Forward ALL cookies from the incoming request
      const allHeaders: Record<string, string> = {};
      if (cookieHeader) {
        allHeaders['Cookie'] = cookieHeader;
      }
      // Forward other relevant headers
      const origin = event.request.headers.get('origin');
      const referer = event.request.headers.get('referer');
      if (origin) allHeaders['Origin'] = origin;
      if (referer) allHeaders['Referer'] = referer;
      
      const response = await fetch(`${base}/auth/me`, {
        method: 'GET',
        headers: allHeaders,
        credentials: 'include'
      });
      
      const responseText = await response.text();
      console.log('[POST /api/admin/users] Backend /auth/me response:', { 
        status: response.status, 
        statusText: response.statusText,
        responsePreview: responseText.substring(0, 200)
      });
      
      const data = JSON.parse(responseText || '{}');
      const backendUser = data?.user;
      const email = (backendUser?.email || backendUser?.username || '').trim().toLowerCase();
      
      console.log('[POST /api/admin/users] Backend response parsed:', { email, hasUser: !!backendUser, fullData: data });
      
      // HARDCODE: If email is jonakfir@gmail.com, ALWAYS allow
      if (email === 'jonakfir@gmail.com') {
        allowAccess = true;
        console.log('[POST /api/admin/users] ✅ ALLOWING - jonakfir@gmail.com detected from backend');
      } else {
        console.log('[POST /api/admin/users] ❌ Email mismatch:', email, '!== jonakfir@gmail.com');
      }
    } catch (e) {
      console.error('[POST /api/admin/users] Backend check failed:', e);
    }
    
    // Also check mock headers (dev mode)
    if (!allowAccess) {
      const mockEmail = event.request.headers.get('X-User-Email');
      if (mockEmail && mockEmail.trim().toLowerCase() === 'jonakfir@gmail.com') {
        allowAccess = true;
        console.log('[POST /api/admin/users] ✅ ALLOWING - jonakfir@gmail.com detected from mock header');
      }
    }
    
    // If still not allowed, try getCurrentAdmin (has its own hardcoded check)
    if (!allowAccess) {
      try {
        const admin = await getCurrentAdmin(event);
        if (admin) {
          allowAccess = true;
          console.log('[POST /api/admin/users] ✅ ALLOWING - getCurrentAdmin returned admin');
        }
      } catch (e) {
        console.error('[POST /api/admin/users] getCurrentAdmin error:', e);
      }
    }
    
    // FINAL CHECK: If still not allowed, BLOCK
    if (!allowAccess) {
      console.error('[POST /api/admin/users] ❌ BLOCKING - No admin access detected');
      return json({ ok: false, error: 'Unauthorized - Admin access required' }, { status: 403 });
    }
    
    // Ensure user exists in Prisma
    await ensurePrismaUser('jonakfir@gmail.com');

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
