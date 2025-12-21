import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_API_URL } from '$env/static/public';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { ensurePrismaUser } from '$lib/utils/syncUser';

/**
 * Get current user from backend API
 * Returns backend user (with numeric id) and creates/finds corresponding Prisma user
 * Also supports mock auth in dev mode via X-User-Id header
 */
async function getCurrentUser(event: { request: Request; cookies: any; url: URL; fetch: typeof fetch; formDataUserId?: string | null; formDataUserEmail?: string | null }): Promise<{ id: string; backendId: number } | null> {
  try {
    // Check for user info from FormData first (more reliable than headers with FormData)
    const userIdFromForm = event.formDataUserId;
    const emailFromForm = event.formDataUserEmail;
    
    // Check for mock auth header (set by client when using localStorage mock)
    const mockUserId = event.request.headers.get('X-User-Id') || userIdFromForm;
    const mockUserEmail = event.request.headers.get('X-User-Email') || emailFromForm;
    
    // In dev mode with mock auth, use the header or FormData
    if (mockUserId && mockUserEmail) {
      console.log('[getCurrentUser] Using mock auth - ID:', mockUserId, 'Email:', mockUserEmail);
      const userId = String(mockUserId);
      
      // Find by username (email) since that's our unique identifier
      let prismaUser = await prisma.user.findFirst({
        where: {
          username: mockUserEmail
        }
      });
      
      if (!prismaUser) {
        console.log('[getCurrentUser] Creating Prisma user for mock auth');
        const bcrypt = await import('bcryptjs');
        const defaultPassword = await bcrypt.hash('temp', 10);
        const { randomBytes } = await import('crypto');
        
        // Generate unique 9-digit user ID
        const userId = await generateUserId();
        
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
            id: userId,
            username: mockUserEmail,
            password: defaultPassword,
            invitationCode
          }
        });
      }
      
      return {
        id: prismaUser.id,
        backendId: Number(mockUserId)
      };
    }
    
    // Otherwise, try real backend auth
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    // Build backend URL - use PUBLIC_API_URL or default to localhost
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';
    const authUrl = `${backendUrl}/auth/me`;
    
    console.log('[getCurrentUser] Calling backend:', authUrl);
    console.log('[getCurrentUser] Cookies present:', cookieHeader ? 'Yes (' + cookieHeader.substring(0, 100) + '...)' : 'No');
    
    // Call backend directly with cookies forwarded
    const response = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader
      }
    });
    
    if (!response.ok) {
      console.log('[getCurrentUser] Backend returned status:', response.status);
      const text = await response.text();
      console.log('[getCurrentUser] Backend response:', text.substring(0, 200));
      return null;
    }
    
    const data = await response.json();
    console.log('[getCurrentUser] Backend response data:', JSON.stringify(data).substring(0, 300));
    
    const backendUser = data?.user || (data?.ok && data?.user !== null) ? data?.user : null;
    
    if (!backendUser || !backendUser.id) {
      console.log('[getCurrentUser] No user in response. Full data:', JSON.stringify(data));
      return null;
    }
    
    console.log('[getCurrentUser] Found backend user - ID:', backendUser.id, 'Email:', backendUser.email);
    
    // Backend returns numeric ID, but we need to find/create Prisma user
    // Try to find by email first, or create if doesn't exist
    const email = backendUser.email || backendUser.username || `user_${backendUser.id}`;
    
      // Find by username (email) since that's our unique identifier
      // Don't use ID lookup anymore since we're letting Prisma generate unique IDs
      let prismaUser = await prisma.user.findFirst({
        where: {
          username: email
        }
      });
    
    // If user doesn't exist in Prisma, create it
    if (!prismaUser) {
      console.log('[getCurrentUser] Creating Prisma user for backend ID:', backendUser.id);
      // Use a simple password hash (users should set real password via profile)
      const bcrypt = await import('bcryptjs');
      const defaultPassword = await bcrypt.hash('temp', 10);
      const { randomBytes } = await import('crypto');
      
      // Generate unique 9-digit user ID
      const userId = await generateUserId();
      
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
          id: userId,
          username: email,
          password: defaultPassword,
          invitationCode
        }
      });
      console.log('[getCurrentUser] Created Prisma user:', prismaUser.id, 'with invitation code:', invitationCode);
    } else {
      console.log('[getCurrentUser] Found existing Prisma user:', prismaUser.id);
    }
    
    return {
      id: prismaUser.id,
      backendId: Number(backendUser.id)
    };
  } catch (error: any) {
    console.error('[getCurrentUser] Error:', error.message || error);
    console.error('[getCurrentUser] Stack:', error.stack);
    return null;
  }
}

/**
 * POST /api/collages - Upload and save a collage
 * Expects: multipart/form-data with 'file' (image) field
 */
export const POST: RequestHandler = async (event) => {
  try {
    const { request } = event;

    // Parse form data first to get user info
    const formData = await request.formData();
    
    // Get user info from FormData FIRST (most reliable with file uploads)
    const formDataUserId = formData.get('userId') as string | null;
    const formDataUserEmail = formData.get('userEmail') as string | null;
    
    console.log('[POST /api/collages] ========== AUTH CHECK ==========');
    console.log('[POST /api/collages] FormData userId:', formDataUserId, 'email:', formDataUserEmail);
    console.log('[POST /api/collages] Headers X-User-Id:', event.request.headers.get('X-User-Id'));
    console.log('[POST /api/collages] Headers X-User-Email:', event.request.headers.get('X-User-Email'));
    console.log('[POST /api/collages] All headers:', Object.fromEntries(event.request.headers.entries()));

    // Check authentication - try FormData first, then headers, then backend
    let user = null;
    
    // If we have user info in FormData, use it directly (fast path for mock auth)
    if (formDataUserId && formDataUserEmail) {
      console.log('[POST /api/collages] Using FormData auth - ID:', formDataUserId, 'Email:', formDataUserEmail);
      const userId = String(formDataUserId);
      
      // Find by username only (since we're not using backend ID as Prisma ID anymore)
      let prismaUser = await prisma.user.findFirst({
        where: {
          username: formDataUserEmail
        }
      });
      
      if (!prismaUser) {
        console.log('[POST /api/collages] Creating Prisma user for FormData auth');
        const bcrypt = await import('bcryptjs');
        const defaultPassword = await bcrypt.hash('temp', 10);
        const { randomBytes } = await import('crypto');
        
        // Generate unique 9-digit user ID
        const userId = await generateUserId();
        
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
            id: userId,
            username: formDataUserEmail,
            password: defaultPassword,
            invitationCode
          }
        });
      }
      
      user = {
        id: prismaUser.id,
        backendId: Number(formDataUserId)
      };
      console.log('[POST /api/collages] Authenticated via FormData - user ID:', user.id);
    } else {
      // Fall back to getCurrentUser which checks headers and backend
      console.log('[POST /api/collages] No FormData user, trying getCurrentUser...');
      user = await getCurrentUser({ ...event, formDataUserId, formDataUserEmail });
    }
    
    if (!user) {
      console.log('[POST /api/collages] ========== AUTH FAILED ==========');
      console.log('[POST /api/collages] FormData userId:', formDataUserId, 'email:', formDataUserEmail);
      console.log('[POST /api/collages] Headers present:', {
        'X-User-Id': !!event.request.headers.get('X-User-Id'),
        'X-User-Email': !!event.request.headers.get('X-User-Email')
      });
      return json({ ok: false, error: 'Unauthorized - Please log in first' }, { status: 401 });
    }
    
    console.log('[POST /api/collages] ========== AUTH SUCCESS ==========');
    console.log('[POST /api/collages] Authenticated user ID:', user.id);
    
    const file = formData.get('file') as File | null;
    const emotionsStr = formData.get('emotions') as string | null; // JSON array of emotions

    if (!file) {
      return json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return json({ ok: false, error: 'File must be an image' }, { status: 400 });
    }

    // Parse emotions (optional)
    let emotions: string[] | null = null;
    if (emotionsStr) {
      try {
        emotions = JSON.parse(emotionsStr);
        if (!Array.isArray(emotions)) emotions = null;
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Convert file to base64 data URL (works on Vercel serverless)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Save to database with base64 data URL
    console.log('[POST /api/collages] Saving collage with userId:', user.id, 'imageUrl length:', dataUrl.length);
    const collage = await prisma.collage.create({
      data: {
        userId: user.id,
        imageUrl: dataUrl, // Store as base64 data URL instead of file path
        emotions: emotions ? JSON.stringify(emotions) : null
      }
    });
    
    console.log('[POST /api/collages] Created collage:', {
      id: collage.id,
      userId: collage.userId,
      imageUrl: collage.imageUrl,
      emotions: collage.emotions
    });

    return json({
      ok: true,
      collage: {
        id: collage.id,
        imageUrl: collage.imageUrl,
        emotions: collage.emotions ? JSON.parse(collage.emotions) : null,
        folder: collage.folder || 'Me',
        createdAt: collage.createdAt
      }
    });
  } catch (error: any) {
    console.error('[POST /api/collages] error:', error);
    return json(
      { ok: false, error: error?.message || 'Failed to save collage' },
      { status: 500 }
    );
  }
};

/**
 * GET /api/collages - Get all collages for the current user
 */
export const GET: RequestHandler = async (event) => {
  try {
    console.log('[GET /api/collages] ========== AUTH CHECK ==========');
    console.log('[GET /api/collages] Headers X-User-Id:', event.request.headers.get('X-User-Id'));
    console.log('[GET /api/collages] Headers X-User-Email:', event.request.headers.get('X-User-Email'));
    console.log('[GET /api/collages] Authorization header:', event.request.headers.get('Authorization') ? 'Present' : 'Missing');
    
    // Check authentication - same logic as POST
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    
    let user = null;
    
    // If we have mock auth headers, use them directly (fast path for mock auth)
    if (mockUserId && mockUserEmail) {
      console.log('[GET /api/collages] Using mock auth headers - ID:', mockUserId, 'Email:', mockUserEmail);
      
      // Use ensurePrismaUser to find or create user (same as POST)
      const prismaUser = await ensurePrismaUser(mockUserEmail);
      if (prismaUser) {
        user = {
          id: prismaUser.id,
          backendId: Number(mockUserId)
        };
        console.log('[GET /api/collages] Authenticated via mock headers - user ID:', user.id);
      }
    } else {
      // Fall back to getCurrentUser which checks backend
      console.log('[GET /api/collages] No mock headers, trying getCurrentUser...');
      user = await getCurrentUser(event);
      
      // If getCurrentUser failed, try backend directly
      if (!user) {
        console.log('[GET /api/collages] getCurrentUser failed, trying backend directly...');
        const { PUBLIC_API_URL } = await import('$env/static/public');
        const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
        const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
        const cookieHeader = event.request.headers.get('cookie') || '';
        
        const headers: HeadersInit = { Cookie: cookieHeader };
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }
        
        try {
          const backendRes = await fetch(`${base}/auth/me`, {
            method: 'GET',
            headers,
            credentials: 'include'
          });
          
          if (backendRes.ok) {
            const backendData = await backendRes.json();
            const backendUser = backendData?.user;
            
            if (backendUser?.email) {
              console.log('[GET /api/collages] Backend user found:', backendUser.email);
              const prismaUser = await ensurePrismaUser(backendUser.email);
              if (prismaUser) {
                user = {
                  id: prismaUser.id,
                  backendId: Number(backendUser.id)
                };
                console.log('[GET /api/collages] Found user via backend:', { id: user.id });
              }
            }
          }
        } catch (backendError) {
          console.error('[GET /api/collages] Backend auth fallback failed:', backendError);
        }
      }
    }
    
    if (!user) {
      console.log('[GET /api/collages] ========== AUTH FAILED ==========');
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log('[GET /api/collages] ========== AUTH SUCCESS ==========');
    console.log('[GET /api/collages] Fetching collages for user ID:', user.id, '(type:', typeof user.id, ')');

    // Fetch user's collages
    const collages = await prisma.collage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    console.log('[GET /api/collages] Found', collages.length, 'collages');
    console.log('[GET /api/collages] Collages:', collages.map(c => ({
      id: c.id,
      userId: c.userId,
      imageUrl: c.imageUrl,
      emotions: c.emotions
    })));
    
    // Also try to find all collages to debug
    const allCollages = await prisma.collage.findMany({});
    console.log('[GET /api/collages] Total collages in DB:', allCollages.length);
    if (allCollages.length > 0) {
      console.log('[GET /api/collages] All collages userIds:', allCollages.map(c => ({ id: c.id, userId: c.userId, userIdType: typeof c.userId })));
    }

    return json({
      ok: true,
      collages: collages.map(c => ({
        id: c.id,
        imageUrl: c.imageUrl,
        emotions: c.emotions ? JSON.parse(c.emotions) : null,
        folder: c.folder || 'Me',
        createdAt: c.createdAt
      }))
    });
  } catch (error: any) {
    console.error('[GET /api/collages] error:', error);
    console.error('[GET /api/collages] error stack:', error.stack);
    return json(
      { ok: false, error: error?.message || 'Failed to fetch collages' },
      { status: 500 }
    );
  }
};

