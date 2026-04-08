import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
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
    const folder = url.searchParams.get('folder'); // e.g. "Generated Photos/Anger"
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
    } else if (excludeGeneratedFolder) {
      // Exclude photos in Generated Photos folder
      // Filter where folder is null OR folder doesn't contain "Generated Photos/"
      where.OR = [
        { folder: null },
        { folder: { not: { contains: 'Generated Photos/' } } }
      ];
    }

    // Fetch Ekman images with organization visibility
    const images = await prisma.ekmanImage.findMany({
      where,
      include: {
        organizationVisibility: {
          include: {
            organization: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format response
    const formattedImages = images.map(img => ({
      id: img.id,
      imageData: img.imageData,
      label: img.label,
      difficulty: img.difficulty,
      photoType: img.photoType,
      folder: img.folder ?? null,
      createdAt: img.createdAt,
      organizations: img.organizationVisibility.map(v => ({
        id: v.organization.id,
        name: v.organization.name
      }))
    }));

    return json({
      ok: true,
      images: formattedImages,
      total: formattedImages.length
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
    // organizationId is Int in schema, so parse each string to number
    if (organizationIds.length > 0) {
      await prisma.ekmanImageOrganizationVisibility.createMany({
        data: organizationIds.map(orgId => ({
          ekmanImageId: ekmanImage.id,
          organizationId: parseInt(String(orgId), 10)
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
