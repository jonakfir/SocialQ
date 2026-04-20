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

    // PERF: never fetch `imageData` (the multi-MB base64 column) in the list
    // query. It used to come inline in two forms:
    //   - a single-pass SELECT with imageData → gigabytes over the wire
    //   - a two-pass SELECT that fetched imageData in a second `where { id in }`
    //     query → crashed Prisma with "Failed to convert rust String into napi
    //     string" when any single row's base64 was over the FFI string limit.
    //
    // New approach: return a stable lazy URL as `imageData`. The UI stuffs
    // that into `<img src>`; the browser only fetches tiles it's about to
    // paint (thanks to loading="lazy" + content-visibility). The per-image
    // endpoint 302-redirects to the CDN for migrated rows or streams the
    // decoded bytes for a single legacy row at a time — well under Prisma's
    // FFI string limit.
    const t0 = Date.now();
    const thin = await prisma.ekmanImage.findMany({
      where,
      select: {
        id: true,
        imageUrl: true,  // cheap string; lets us skip the per-id fetch in the response URL? no — keep the lazy URL uniform so behavior is consistent
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
    const legacyCount = thin.filter((r) => !r.imageUrl).length;
    console.log(
      `[GET /api/admin/ekman-images] ${thin.length} rows in ${Date.now() - t0}ms ` +
      `(legacy-needing-lazy: ${legacyCount}) (filters: ${JSON.stringify({ emotion, photoType, difficulty, folder, folderStartsWith, excludeSynthetic, excludeGeneratedFolder })})`
    );

    // Every row's `imageData` in the response is now a lazy endpoint. Even
    // rows with `imageUrl` go through the lazy endpoint so the UI doesn't need
    // to branch — the endpoint 302-redirects for those, costing one extra
    // cheap hop. If that hop ever becomes a hotspot, switch to returning
    // imageUrl directly here for migrated rows.
    const formattedImages = thin.map((img) => ({
      id: img.id,
      imageData: `/api/admin/ekman-images/${img.id}/image`,
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
