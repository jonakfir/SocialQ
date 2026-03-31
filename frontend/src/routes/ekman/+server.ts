// src/routes/ekman/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { toPrismaUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';

/** Generate a unique numeric user id using raw SQL (avoids touching User columns that may not exist). */
async function generateUserIdRaw(): Promise<number> {
  for (let attempts = 0; attempts < 100; attempts++) {
    const id = Math.floor(100000000 + Math.random() * 900000000);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>('SELECT id FROM users WHERE id = $1 LIMIT 1', id);
    if (!rows?.length) return id;
  }
  throw new Error('Failed to generate unique user ID');
}

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

// Map emotion names from saved collages to ekman format
const EMOTION_MAP: Record<string, string> = {
  'Angry': 'Anger',
  'Disgust': 'Disgust',
  'Fear': 'Fear',
  'Happy': 'Happy',
  'Sad': 'Sad',
  'Surprise': 'Surprise'
};

// Get user's saved collages for the corpus
async function getUserCollages(userId: string | null): Promise<Array<{ img: string; label: string; difficulty: string }>> {
  if (!userId) return [];
  
  try {
    const collages = await prisma.collage.findMany({
      where: { userId: toPrismaUserId(userId) },
      select: {
        imageUrl: true,
        emotions: true
      }
    });
    
    const userImages: Array<{ img: string; label: string; difficulty: string }> = [];
    
    for (const collage of collages) {
      if (!collage.emotions) continue;
      
      try {
        const emotions = JSON.parse(collage.emotions);
        if (Array.isArray(emotions) && emotions.length > 0) {
          // Map to ekman format (e.g., "Angry" -> "Anger")
          const emotion = emotions[0];
          const ekmanEmotion = EMOTION_MAP[emotion] || emotion;
          
          // Only include if it's a recognized emotion
          if (EMOTIONS.includes(ekmanEmotion)) {
            // imageUrl is already a base64 data URL for user collages
            userImages.push({
              img: collage.imageUrl, // Base64 data URL
              label: ekmanEmotion,
              difficulty: 'user' // Mark user photos with difficulty 'user'
            });
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }
    
    return userImages;
  } catch (error) {
    console.error('[ekman] Error fetching user collages:', error);
    return [];
  }
}

// Get friends' saved collages for the corpus
async function getFriendsCollages(userId: string | null): Promise<Array<{ img: string; label: string; difficulty: string }>> {
  if (!userId) return [];
  
  try {
    // Get all friendships where user is either userId1 or userId2
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: userId },
          { userId2: userId }
        ]
      },
      select: {
        userId1: true,
        userId2: true
      }
    });
    
    // Collect all friend IDs
    const friendIds = new Set<string>();
    friendships.forEach(f => {
      if (f.userId1 !== userId) friendIds.add(f.userId1);
      if (f.userId2 !== userId) friendIds.add(f.userId2);
    });
    
    if (friendIds.size === 0) return [];
    
    // Fetch collages for all friends
    const friendCollages = await prisma.collage.findMany({
      where: {
        userId: { in: Array.from(friendIds) }
      },
      select: {
        imageUrl: true,
        emotions: true
      }
    });
    
    const friendImages: Array<{ img: string; label: string; difficulty: string }> = [];
    
    for (const collage of friendCollages) {
      if (!collage.emotions) continue;
      
      try {
        const emotions = JSON.parse(collage.emotions);
        if (Array.isArray(emotions) && emotions.length > 0) {
          // Map to ekman format (e.g., "Angry" -> "Anger")
          const emotion = emotions[0];
          const ekmanEmotion = EMOTION_MAP[emotion] || emotion;
          
          // Only include if it's a recognized emotion
          if (EMOTIONS.includes(ekmanEmotion)) {
            friendImages.push({
              img: collage.imageUrl,
              label: ekmanEmotion,
              difficulty: 'friend' // Mark friend photos with difficulty 'friend'
            });
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }
    
    return friendImages;
  } catch (error) {
    console.error('[ekman] Error fetching friends collages:', error);
    return [];
  }
}

// Get current user from request (supports mock auth)
async function getCurrentUser(event: { request: Request }): Promise<{ id: string } | null> {
  try {
    // Check for mock auth header
    const mockUserId = event.request.headers.get('X-User-Id');
    if (mockUserId) {
      return { id: String(mockUserId) };
    }
    
    // Try backend auth (cookies for web, Bearer for mobile app)
    const cookieHeader = event.request.headers.get('cookie') || '';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';

    const headers: Record<string, string> = {};
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (authHeader) headers['Authorization'] = authHeader;

    try {
      const response = await fetch(`${backendUrl}/auth/me`, {
        headers: headers
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.id) {
          const userId = String(data.user.id);
          const email = (data.user.email || data.user.username || `user_${userId}`).trim();
          // Raw SQL so we never SELECT missing columns (e.g. photoSourceSettings)
          const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
            'SELECT id FROM users WHERE email = $1 LIMIT 1',
            email
          );
          let prismaId: number;
          if (rows?.[0]) {
            prismaId = rows[0].id;
          } else {
            const bcrypt = await import('bcryptjs');
            const defaultPassword = await bcrypt.hash('temp', 10);
            const newUserId = await generateUserIdRaw();
            // Only columns that exist in backend users table (no invitationCode/photoSourceSettings)
            await prisma.$executeRawUnsafe(
              'INSERT INTO users (id, email, password, role) VALUES ($1, $2, $3, $4)',
              newUserId,
              email,
              defaultPassword,
              'personal'
            );
            prismaId = newUserId;
          }
          return { id: String(prismaId) };
        }
      }
    } catch {
      // Backend not available, that's ok
    }
    
    return null;
  } catch {
    return null;
  }
}

// Load static assets (works in Vercel). Canonical = all ekman folder except generated.
let staticImageModules: Record<string, string> | null = null;
function getStaticImages() {
  if (!staticImageModules) {
    try {
      staticImageModules = import.meta.glob('$lib/assets/ekman/**/*.{png,jpg,jpeg,webp}', {
        eager: true,
        query: '?url'
      }) as Record<string, string>;
    } catch (err) {
      console.error('[getAllImages] Error loading static images:', err);
      staticImageModules = {};
    }
  }
  return staticImageModules;
}

// Generated photos folder: $lib/assets/ekman/generated/Label_difficulty/*.jpg — used as fallback instead of external URLs
let generatedImageModules: Record<string, string> | null = null;
function getStaticGeneratedImages(): Array<{ img: string; label: string; difficulty: string }> {
  if (!generatedImageModules) {
    try {
      generatedImageModules = import.meta.glob('$lib/assets/ekman/generated/**/*.{png,jpg,jpeg,webp}', {
        eager: true,
        query: '?url'
      }) as Record<string, string>;
    } catch {
      generatedImageModules = {};
    }
  }
  const images: Array<{ img: string; label: string; difficulty: string }> = [];
  for (const [path, url] of Object.entries(generatedImageModules)) {
    const parts = path.split('/');
    const folder = parts[parts.length - 2]; // e.g. Anger_1
    if (folder) {
      const [label, difficulty] = folder.split('_');
      if (label && EMOTIONS.includes(label)) {
        const imageUrl = typeof url === 'string' ? url : (url as any)?.default ?? '';
        if (imageUrl) images.push({ img: imageUrl, label, difficulty: difficulty || '1' });
      }
    }
  }
  return images;
}

function getFallbackPoolFromStatic(): Array<{ img: string; label: string; difficulty: string }> {
  const generated = getStaticGeneratedImages();
  if (generated.length > 0) return generated;
  const imageModules = getStaticImages();
  const canonical: Array<{ img: string; label: string; difficulty: string }> = [];
  for (const [path, url] of Object.entries(imageModules)) {
    const parts = path.split('/');
    const folder = parts[parts.length - 2];
    if (folder && !folder.startsWith('Transition') && !path.includes('/generated/')) {
      const [label, difficulty] = folder.split('_');
      if (label && EMOTIONS.includes(label)) {
        const imageUrl = typeof url === 'string' ? url : (url as any)?.default ?? '';
        if (imageUrl) canonical.push({ img: imageUrl, label, difficulty: difficulty || '1' });
      }
    }
  }
  return canonical;
}

// Get user's organization IDs
async function getUserOrganizationIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    const uid = toPrismaUserId(userId);
    const memberships = await prisma.organizationMembership.findMany({
      where: {
        userId: uid,
        status: 'approved'
      },
      select: {
        organizationId: true
      }
    });
    
    return memberships.map(m => m.organizationId);
  } catch (error) {
    console.error('[getUserOrganizationIds] Error:', error);
    return [];
  }
}

// Effective photo source settings: intersection of user and all their orgs. Default = all true.
function parsePhotoSourceSettings(raw: string | null): { ekman: boolean; own: boolean; synthetic: boolean } {
  const defaults = { ekman: false, own: true, synthetic: true };
  if (!raw) return defaults;
  try {
    const o = JSON.parse(raw);
    return {
      ekman: typeof o.ekman === 'boolean' ? o.ekman : defaults.ekman,
      own: typeof o.own === 'boolean' ? o.own : defaults.own,
      synthetic: typeof o.synthetic === 'boolean' ? o.synthetic : defaults.synthetic
    };
  } catch {
    return defaults;
  }
}

async function getEffectivePhotoSourceSettings(userId: string | null): Promise<{ ekman: boolean; own: boolean; synthetic: boolean }> {
  const defaults = { ekman: false, own: true, synthetic: true };
  if (!userId) return defaults;
  try {
    const id = toPrismaUserId(userId);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      'SELECT id FROM users WHERE id = $1 LIMIT 1',
      id
    );
    if (!rows?.[0]) return defaults;
    return defaults;
  } catch {
    return defaults;
  }
}

type PoolItem = { id?: string; img: string; label: string; difficulty: string };

// photoTypeFilter: 'ekman' = ekman+other, 'synthetic' = synthetic, 'canonical' = only from assets/ekman folder (folder = 'canonical')
// lightMode: when true, do NOT select imageData (huge) — only id, label, difficulty for fast quiz loading
async function getAllImages(
  userOrganizationIds: string[] = [],
  photoTypeFilter?: 'ekman' | 'synthetic' | 'canonical',
  lightMode = false
): Promise<PoolItem[]> {
  try {
    const whereClause: any = {};
    if (photoTypeFilter === 'canonical') {
      whereClause.folder = 'canonical';
    } else if (photoTypeFilter === 'ekman') {
      whereClause.photoType = { in: ['ekman', 'other'] };
    } else if (photoTypeFilter === 'synthetic') {
      whereClause.photoType = 'synthetic';
    }

    const selectImageData = !lightMode;
    const allImages = await prisma.ekmanImage.findMany({
      where: Object.keys(whereClause).length ? whereClause : undefined,
      select: {
        id: true,
        ...(selectImageData ? { imageData: true } : {}),
        label: true,
        difficulty: true,
        organizationVisibility: {
          select: {
            organizationId: true
          }
        }
      }
    });

    if (allImages.length > 0) {
      const filteredImages = allImages.filter((img: any) => {
        if (img.organizationVisibility.length === 0) return true;
        if (userOrganizationIds.length === 0) return false;
        const imageOrgIds = img.organizationVisibility.map((v: any) => v.organizationId);
        return userOrganizationIds.some(orgId => imageOrgIds.includes(orgId));
      });
      return filteredImages.map((img: any) => ({
        id: img.id,
        img: selectImageData && img.imageData != null ? img.imageData : '',
        label: img.label,
        difficulty: img.difficulty
      }));
    }
  } catch (err: any) {
    console.warn('[getAllImages] Database query failed:', err?.message);
  }

  if (photoTypeFilter === 'synthetic') return [];
  // For canonical: only use static assets from $lib/assets/ekman (no DB fallback with other types)
  if (photoTypeFilter === 'canonical') {
    const imageModules = getStaticImages();
    const images: Array<{ img: string; label: string; difficulty: string }> = [];
    for (const [path, url] of Object.entries(imageModules)) {
      const parts = path.split('/');
      const folder = parts[parts.length - 2];
      if (folder && !folder.startsWith('Transition')) {
        const [label, difficulty] = folder.split('_');
        if (label && EMOTIONS.includes(label)) {
          const imageUrl = typeof url === 'string' ? url : (url as any).default || url;
          images.push({
            img: imageUrl,
            label: label,
            difficulty: difficulty || '1'
          });
        }
      }
    }
    return images;
  }
  // Fallback to static imports only for ekman (no synthetic in static)
  const imageModules = getStaticImages();
  const images: Array<{ img: string; label: string; difficulty: string }> = [];
  for (const [path, url] of Object.entries(imageModules)) {
    const parts = path.split('/');
    const folder = parts[parts.length - 2];
    if (folder && !folder.startsWith('Transition')) {
      const [label, difficulty] = folder.split('_');
      if (label && EMOTIONS.includes(label)) {
        const imageUrl = typeof url === 'string' ? url : (url as any).default || url;
        images.push({
          img: imageUrl,
          label: label,
          difficulty: difficulty || '1'
        });
      }
    }
  }
  return images;
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const GET: RequestHandler = async (event) => {
  const diff = (event.url.searchParams.get('difficulty') ?? '1').toString();
  const photoTypeParam = (event.url.searchParams.get('photoType') ?? '').toLowerCase();
  const ekmanOnly = (event.url.searchParams.get('ekmanOnly') ?? '').toLowerCase() === '1' || photoTypeParam === 'ekman';
  const generatedOnly = photoTypeParam === 'synthetic' || photoTypeParam === 'generated';
  const light = event.url.searchParams.get('light') === '1';
  const count = Number(event.url.searchParams.get('count') ?? '12');

  let pool: PoolItem[] = [];

  try {
    console.log(`[ekman] Fetching images for difficulty: ${diff}, ekmanOnly: ${ekmanOnly}, generatedOnly: ${generatedOnly}`);

    if (ekmanOnly) {
      const canonicalImages = await getAllImages([], 'canonical');
      pool = [...canonicalImages];
      console.log(`[ekman] Canonical only: ${pool.length} images from assets/ekman`);
    } else if (generatedOnly) {
      // Facial recognition: static generated folder first, then DB synthetic (e.g. from generate-synthetic-photos script)
      pool = getStaticGeneratedImages();
      if (pool.length === 0) {
        // When light=1, do NOT load imageData from DB (saves 30+ seconds with 78 images)
        const dbSynthetic = await getAllImages([], 'synthetic', light);
        pool = dbSynthetic;
        console.log(`[ekman] Generated folder empty; using ${pool.length} synthetic images from DB`);
      } else {
        console.log(`[ekman] Generated folder: ${pool.length} images`);
      }
    } else {
      const user = await getCurrentUser(event);
      const userOrganizationIds = user ? await getUserOrganizationIds(user.id) : [];
      const effective = user ? await getEffectivePhotoSourceSettings(user.id) : { ekman: false, own: true, synthetic: true };
      console.log(`[ekman] Effective photo sources: ekman=${effective.ekman} own=${effective.own} synthetic=${effective.synthetic}`);

      if (effective.ekman) {
        const ekmanImages = await getAllImages(userOrganizationIds, 'ekman');
        pool = [...pool, ...ekmanImages];
        console.log(`[ekman] Added ${ekmanImages.length} ekman/other images`);
      }
      if (effective.synthetic) {
        const syntheticImages = await getAllImages(userOrganizationIds, 'synthetic');
        pool = [...pool, ...syntheticImages];
        console.log(`[ekman] Added ${syntheticImages.length} synthetic images`);
      }
      if (effective.own && user) {
        const userCollages = await getUserCollages(user.id);
        const friendsCollages = await getFriendsCollages(user.id);
        pool = [...pool, ...userCollages, ...friendsCollages];
        console.log(`[ekman] Added ${userCollages.length} user + ${friendsCollages.length} friends photos`);
      }
    }
  } catch (err: any) {
    console.warn('[ekman] Pool build failed (e.g. missing DB columns), using fallback:', err?.message);
    pool = [];
  }

  // Include images that match the requested difficulty OR have difficulty 'all'
  pool = pool
    .filter((row) => (diff === 'all' ? true : row.difficulty === diff || row.difficulty === 'all'))
    .map((row) => ({ id: row.id, img: row.img, label: row.label, difficulty: row.difficulty }));

  if (pool.length === 0) {
    // Facial recognition (generatedOnly): only generated folder, never Ekman. Other modes: generated then canonical.
    const fallback = generatedOnly
      ? getStaticGeneratedImages()
      : getFallbackPoolFromStatic();
    pool = fallback.filter((row) =>
      diff === 'all' ? true : row.difficulty === diff || row.difficulty === 'all'
    );
    if (pool.length > 0) {
      console.log(`[ekman] Using ${generatedOnly ? 'generated' : 'generated/canonical'} static fallback: ${pool.length} images`);
    } else if (generatedOnly) {
      console.warn('[ekman] Generated folder empty; add images to src/lib/assets/ekman/generated/Label_difficulty/ (e.g. Anger_1/, Happy_2/).');
    }
  }

  console.log(`[ekman] Total pool size: ${pool.length}, requested count: ${count}, light: ${light}`);
  shuffle(pool);
  const picked = pool.slice(0, Math.min(count, pool.length));
  const rows = picked.map((p) => {
    const distractors = shuffle(EMOTIONS.filter((e) => e !== p.label)).slice(0, 2);
    const options = shuffle([p.label, ...distractors]);
    // When light=1 and we have id, omit img so client uses /api/ekman-image/:id (cacheable, fast)
    if (light && p.id) {
      return { id: p.id, options, correct: p.label };
    }
    return { id: p.id, img: p.img, options, correct: p.label };
  });

  console.log(`[ekman] Returning ${rows.length} questions`);
  return json(rows);
};
