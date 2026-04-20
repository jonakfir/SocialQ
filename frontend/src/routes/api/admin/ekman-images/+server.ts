import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }

    // Try backend auth with JWT token and cookies
    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const response = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) {
      return null;
    }
    
    const prismaUser = await ensurePrismaUser(backendUser.email);
    return prismaUser;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error);
    return null;
  }
}

// GET /api/admin/ekman-images - Get all Ekman images with filtering
export const GET: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can access this endpoint' }, { status: 403 });
    }

    // Parse query parameters
    const url = new URL(event.request.url);
    const emotion = url.searchParams.get('emotion');
    const photoType = url.searchParams.get('photoType');
    const difficulty = url.searchParams.get('difficulty');
    const folder = url.searchParams.get('folder'); // e.g. "Generated Photos/Anger" — exact match
    const folderStartsWith = url.searchParams.get('folderStartsWith'); // e.g. "Generated Photos/" — prefix match
    const excludeSynthetic = url.searchParams.get('excludeSynthetic') === 'true';
    const excludeGeneratedFolder = url.searchParams.get('excludeGeneratedFolder') === 'true';

    // Build where clause
    const where: any = {};

    if (emotion && emotion !== 'All') {
      where.label = emotion;
    }

    if (photoType && photoType !== 'All') {
      where.photoType = photoType;
    } else if (excludeSynthetic) {
      // Exclude synthetic photos if excludeSynthetic is true
      where.photoType = { not: 'synthetic' };
    }

    if (difficulty && difficulty !== 'All') {
      where.difficulty = difficulty;
    }

    if (folder) {
      where.folder = folder;
    } else if (folderStartsWith) {
      // Prefix match — e.g. all "Generated Photos/*" regardless of which emotion.
      // Used by the admin photos page's Generated tab when emotion="All" so that
      // rows whose photoType column happens to be null but whose folder is set
      // still surface. Fixes the "Generated + All = empty" bug.
      where.folder = { startsWith: folderStartsWith };
    } else if (excludeGeneratedFolder) {
      // Exclude photos in Generated Photos folder
      // Filter where folder is null OR folder doesn't contain "Generated Photos/"
      where.OR = [
        { folder: null },
        { folder: { not: { contains: 'Generated Photos/' } } }
      ];
    }

    // PERF: every row's `imageData` is a base64 `data:image/...` URL — often
    // MB-sized. Two-pass strategy to avoid pulling base64 we won't use:
    //   Pass 1: select the small metadata columns + `imageUrl` for ALL rows.
    //   Pass 2: for the subset whose `imageUrl` is NULL (pre-migration legacy
    //           rows), fetch `imageData` in a targeted `where: { id: { in } }`
    //           query. Rows that HAVE a CloudFront URL never load the heavy
    //           base64 column over the Postgres wire.
    //
    // Why a second query instead of a clever single query: Prisma can't
    // conditionally select a column based on another column's value. The
    // second query is almost always small (or empty, post-migration).
    //
    // Response contract is unchanged — callers still see `imageData` as the
    // preferred image source (URL when available, base64 otherwise).
    const t0 = Date.now();
    const thin = await prisma.ekmanImage.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,
        label: true,
        difficulty: true,
        photoType: true,
        folder: true,
        createdAt: true,
        organizationVisibility: {
          select: {
            organization: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Pass 2 — only for rows still on base64. Empty array ⇒ skip the query.
    const legacyIds = thin.filter((r) => !r.imageUrl).map((r) => r.id);
    const legacyData: Record<string, string> = {};
    if (legacyIds.length > 0) {
      const legacyRows = await prisma.ekmanImage.findMany({
        where: { id: { in: legacyIds } },
        select: { id: true, imageData: true },
      });
      for (const r of legacyRows) legacyData[r.id] = r.imageData;
    }
    const elapsed = Date.now() - t0;
    console.log(
      `[GET /api/admin/ekman-images] ${thin.length} rows in ${elapsed}ms ` +
      `(legacy base64: ${legacyIds.length}) (filters: ${JSON.stringify({ emotion, photoType, difficulty, folder, folderStartsWith, excludeSynthetic, excludeGeneratedFolder })})`
    );

    // Format response — same shape as before. `imageData` is the URL when one
    // exists, otherwise the base64 data URL from the legacy lookup.
    const formattedImages = thin.map((img) => ({
      id: img.id,
      imageData: img.imageUrl || legacyData[img.id] || '',
      label: img.label,
      difficulty: img.difficulty,
      photoType: img.photoType,
      folder: img.folder ?? null,
      createdAt: img.createdAt,
      organizations: img.organizationVisibility.map((v) => ({
        id: v.organization.id,
        name: v.organization.name
      }))
    }));

    return json({
      ok: true,
      images: formattedImages,
      total: formattedImages.length
    }, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    });
  } catch (error: any) {
    console.error('[GET /api/admin/ekman-images] error', error);
    return json({ ok: false, error: error?.message || 'Failed to fetch images' }, { status: 500 });
  }
};

// POST /api/admin/ekman-images - Upload Ekman image
export const POST: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can upload images' }, { status: 403 });
    }

    // Parse form data
    const formData = await event.request.formData();
    const file = formData.get('file') as File | null;
    const emotion = formData.get('emotion') as string | null;
    const difficulty = formData.get('difficulty') as string | null;
    const photoType = formData.get('photoType') as string | null; // 'ekman' | 'other' | 'synthetic'
    const folder = formData.get('folder') as string | null; // e.g. "Generated Photos/Anger"
    const organizationIdsStr = formData.get('organizationIds') as string | null; // JSON array of org IDs

    if (!file) {
      return json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return json({ ok: false, error: 'File must be an image' }, { status: 400 });
    }

    // Validate required fields
    if (!emotion) {
      return json({ ok: false, error: 'Emotion is required' }, { status: 400 });
    }

    // Map emotion names (Angry -> Anger, etc.)
    const emotionMap: Record<string, string> = {
      'Angry': 'Anger',
      'Disgust': 'Disgust',
      'Fear': 'Fear',
      'Happy': 'Happy',
      'Sad': 'Sad',
      'Surprise': 'Surprise',
      'Neutral': 'Neutral'
    };
    const mappedEmotion = emotionMap[emotion] || emotion;

    // Convert file to base64 data URL
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Parse organization IDs (if empty array, photo is visible to all)
    let organizationIds: string[] = [];
    if (organizationIdsStr) {
      try {
        organizationIds = JSON.parse(organizationIdsStr);
        if (!Array.isArray(organizationIds)) {
          organizationIds = [];
        }
      } catch {
        organizationIds = [];
      }
    }

    // Create EkmanImage
    const ekmanImage = await prisma.ekmanImage.create({
      data: {
        imageData: dataUrl,
        label: mappedEmotion,
        difficulty: difficulty || 'all',
        photoType: (photoType === 'other' ? 'other' : photoType === 'synthetic' ? 'synthetic' : 'ekman'),
        folder: folder || null
      }
    });

    // Create organization visibility records if specified
    if (organizationIds.length > 0) {
      await prisma.ekmanImageOrganizationVisibility.createMany({
        data: organizationIds.map(orgId => ({
          ekmanImageId: ekmanImage.id,
          organizationId: orgId
        }))
      });
    }

    return json({
      ok: true,
      image: {
        id: ekmanImage.id,
        label: ekmanImage.label,
        difficulty: ekmanImage.difficulty,
        photoType: ekmanImage.photoType,
        organizationIds: organizationIds
      }
    });
  } catch (error: any) {
    console.error('[POST /api/admin/ekman-images] error', error);
    return json({ ok: false, error: error?.message || 'Failed to upload image' }, { status: 500 });
  }
};

// PUT /api/admin/ekman-images/[id]/visibility - Update organization visibility
export const PUT: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can update visibility' }, { status: 403 });
    }

    const imageId = event.params.id;
    if (!imageId) {
      return json({ ok: false, error: 'Image ID is required' }, { status: 400 });
    }

    const body = await event.request.json();
    const organizationIds: string[] = body.organizationIds || [];

    // Delete existing visibility records
    await prisma.ekmanImageOrganizationVisibility.deleteMany({
      where: { ekmanImageId: imageId }
    });

    // Create new visibility records if specified
    if (organizationIds.length > 0) {
      await prisma.ekmanImageOrganizationVisibility.createMany({
        data: organizationIds.map(orgId => ({
          ekmanImageId: imageId,
          organizationId: orgId
        }))
      });
    }

    return json({ ok: true });
  } catch (error: any) {
    console.error('[PUT /api/admin/ekman-images/[id]/visibility] error', error);
    return json({ ok: false, error: error?.message || 'Failed to update visibility' }, { status: 500 });
  }
};

// DELETE /api/admin/ekman-images/[id] - Delete Ekman image
export const DELETE: RequestHandler = async (event) => {
  try {
    // Check admin auth
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get fresh role from database
    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';

    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can delete images' }, { status: 403 });
    }

    const imageId = event.params.id;
    if (!imageId) {
      return json({ ok: false, error: 'Image ID is required' }, { status: 400 });
    }

    // Delete the image (cascade will delete visibility records)
    await prisma.ekmanImage.delete({
      where: { id: imageId }
    });

    return json({ ok: true });
  } catch (error: any) {
    console.error('[DELETE /api/admin/ekman-images/[id]] error', error);
    return json({ ok: false, error: error?.message || 'Failed to delete image' }, { status: 500 });
  }
};
