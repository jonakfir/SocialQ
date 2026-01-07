// src/routes/transitions/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

const EMOTIONS = ['Anger','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
type Emotion = typeof EMOTIONS[number];

// Get transition videos from database
async function getAllVideos(): Promise<Array<{ href: string; from: Emotion; to: Emotion }>> {
  try {
    // Fetch from database - this is the primary source
    const dbVideos = await prisma.transitionVideo.findMany({
      select: {
        videoData: true,
        from: true,
        to: true
      }
    });
    
    if (dbVideos.length > 0) {
      console.log(`[transitions] Loaded ${dbVideos.length} videos from database`);
      return dbVideos.map(v => ({
        href: v.videoData, // Base64 data URL
        from: v.from as Emotion,
        to: v.to as Emotion
      }));
    }
    
    console.warn('[transitions] No videos found in database. Run: node scripts/setup-assets-db.js');
    return [];
  } catch (err: any) {
    console.error('[transitions] Error fetching from database:', err);
    // If table doesn't exist, log error but don't crash
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      console.error('[transitions] Database table does not exist. Run: npx prisma db push');
    }
    return [];
  }
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cache the video list to avoid re-scanning on every request
let videoCache: Array<{ href: string; from: Emotion; to: Emotion }> | null = null;

export const GET: RequestHandler = async () => {
  // Load videos once and cache
  if (!videoCache) {
    videoCache = await getAllVideos();
  }

  shuffle(videoCache);
  return json(videoCache);
};
