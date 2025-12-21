// src/routes/ekman/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { readdir, stat } from 'fs/promises';
import { join, sep } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '$lib/db';
import { generateUserId } from '$lib/userId';
import { PUBLIC_API_URL } from '$env/static/public';

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
      where: { userId },
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
            userImages.push({
              img: collage.imageUrl, // This is already a URL path like /uploads/collages/...
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
    
    // Try backend auth
    const cookieHeader = event.request.headers.get('cookie') || '';
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '');
    const backendUrl = base || 'http://localhost:4000';
    
    try {
      const response = await fetch(`${backendUrl}/auth/me`, {
        headers: { cookie: cookieHeader }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.id) {
          // Find or create Prisma user
          const userId = String(data.user.id);
          let prismaUser = await prisma.user.findFirst({
            where: { username: data.user.email || data.user.username || `user_${userId}` }
          });
          
          if (!prismaUser) {
            const bcrypt = await import('bcryptjs');
            const defaultPassword = await bcrypt.hash('temp', 10);
            const { randomBytes } = await import('crypto');
            
            // Generate unique 9-digit user ID
            const newUserId = await generateUserId();
            
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
                id: newUserId,
                username: data.user.email || data.user.username || `user_${userId}`,
                password: defaultPassword,
                invitationCode
              }
            });
          }
          
          return { id: prismaUser.id };
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

// Use Node fs API instead of import.meta.glob to avoid Vite scanning files at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
// From routes/ekman/__dirname -> routes -> src -> src/lib/assets/ekman
const assetsBase = join(__dirname, '../../lib/assets/ekman');

async function getAllImages(): Promise<Array<{ path: string; url: string; label: string; difficulty: string }>> {
  const images: Array<{ path: string; url: string; label: string; difficulty: string }> = [];
  const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

  async function scanDir(dir: string, relativePath: string = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        await scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
        if (extensions.has(ext)) {
          // path like: Happy_3/PE3-21.png
          const parts = relPath.split(sep);
          if (parts.length >= 2) {
            const folder = parts[parts.length - 2]; // "Happy_3"
            const [label, difficulty] = folder.split('_');
            // Convert to URL path (forward slashes)
            // Vite serves assets from src/lib/assets with their original paths in dev mode
            const urlPath = relPath.replace(/\\/g, '/');
            // Use the path that Vite will serve - same as what import.meta.glob would produce
            images.push({
              path: relPath,
              url: `/src/lib/assets/ekman/${urlPath}`,
              label: label || '',
              difficulty: difficulty || ''
            });
          }
        }
      }
    }
  }

  try {
    console.log('[getAllImages] Scanning directory:', assetsBase);
    await scanDir(assetsBase);
    console.log(`[getAllImages] Found ${images.length} images`);
  } catch (err: any) {
    console.error('[getAllImages] Error scanning ekman images:', err);
    console.error('[getAllImages] Error details:', {
      message: err?.message,
      code: err?.code,
      path: err?.path || assetsBase
    });
    // Don't throw - return empty array so the endpoint can still work with user photos
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

// Cache the image list to avoid re-scanning on every request
let imageCache: Array<{ path: string; url: string; label: string; difficulty: string }> | null = null;

export const GET: RequestHandler = async (event) => {
  try {
    const diff = (event.url.searchParams.get('difficulty') ?? '1').toString();
    console.log(`[ekman] Fetching images for difficulty: ${diff}`);
    const count = Number(event.url.searchParams.get('count') ?? '12');

    // Load images once and cache
    if (!imageCache) {
      console.log('[ekman] Loading images from filesystem...');
      imageCache = await getAllImages();
      console.log(`[ekman] Loaded ${imageCache.length} images from filesystem`);
    }

    // Build a bank of { img, label, difficulty } from file system
    let pool = imageCache
      .filter((row) => (diff === 'all' ? true : row.difficulty === diff))
      .map((row) => ({ img: row.url, label: row.label, difficulty: row.difficulty }));

    console.log(`[ekman] Base pool size for difficulty ${diff}: ${pool.length}`);

    // Get current user and add their saved photos + friends' photos to the corpus
    // User and friend photos are ALWAYS included in ALL difficulty levels
    try {
      const user = await getCurrentUser(event);
      if (user) {
        console.log(`[ekman] Adding user collages for user ID: ${user.id} (all difficulty levels)`);
        const userCollages = await getUserCollages(user.id);
        
        // User photos are included in all difficulty levels
        // They will be mixed with the corpus images based on the requested difficulty
        pool = [...pool, ...userCollages];
        console.log(`[ekman] Added ${userCollages.length} user photos to corpus for difficulty: ${diff}`);
        
        // Also add friends' photos to the corpus
        console.log(`[ekman] Adding friends' collages for user ID: ${user.id} (all difficulty levels)`);
        const friendsCollages = await getFriendsCollages(user.id);
        pool = [...pool, ...friendsCollages];
        console.log(`[ekman] Added ${friendsCollages.length} friends' photos to corpus for difficulty: ${diff}`);
      } else {
        console.log('[ekman] No user authenticated, using base pool only');
      }
    } catch (userError: any) {
      console.error('[ekman] Error getting user or collages:', userError);
      // Continue without user photos if there's an error
    }

    if (pool.length === 0) {
      console.warn('[ekman] No images in pool, returning empty array');
      return json([]);
    }

    console.log(`[ekman] Total pool size: ${pool.length}, requested count: ${count}`);
    shuffle(pool);
    const picked = pool.slice(0, Math.min(count, pool.length));
    const rows = picked.map((p) => {
      const distractors = shuffle(EMOTIONS.filter((e) => e !== p.label)).slice(0, 2);
      const options = shuffle([p.label, ...distractors]);
      return { img: p.img, options, correct: p.label };
    });

    console.log(`[ekman] Returning ${rows.length} questions`);
    return json(rows);
  } catch (error: any) {
    console.error('[ekman] Error in GET handler:', error);
    return json(
      { error: error?.message || 'Failed to fetch images' },
      { status: 500 }
    );
  }
};
