// src/routes/transitions/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';

const EMOTIONS = ['Anger','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
type Emotion = typeof EMOTIONS[number];

// Load static videos as fallback (works in Vercel)
let staticVideoModules: Record<string, string> | null = null;
function getStaticVideos() {
  if (!staticVideoModules) {
    try {
      staticVideoModules = import.meta.glob('$lib/assets/ekman/Transition*/*.{mp4,webm}', { 
        eager: true,
        query: '?url'
      }) as Record<string, string>;
    } catch (err) {
      console.error('[getAllVideos] Error loading static videos:', err);
      staticVideoModules = {};
    }
  }
  return staticVideoModules;
}

// Get transition videos from database with static fallback
async function getAllVideos(): Promise<Array<{ href: string; from: Emotion; to: Emotion }>> {
  // Try database first
  try {
    const dbVideos = await prisma.transitionVideo.findMany({
      select: {
        videoData: true,
        from: true,
        to: true
      }
    });
    
    if (dbVideos.length > 0) {
      console.log(`[transitions] ✅ Loaded ${dbVideos.length} videos from database`);
      return dbVideos.map(v => ({
        href: v.videoData, // Base64 data URL
        from: v.from as Emotion,
        to: v.to as Emotion
      }));
    }
  } catch (err: any) {
    console.warn('[transitions] Database query failed, using static fallback:', err?.message);
  }
  
  // Fallback to static imports if database is empty or fails
  console.log('[transitions] Using static imports fallback...');
  const videoModules = getStaticVideos();
  const videos: Array<{ href: string; from: Emotion; to: Emotion }> = [];
  
  for (const [path, url] of Object.entries(videoModules)) {
    // path like: $lib/assets/ekman/TransitionAngryHappy/AngryHappy1.mp4
    const parts = path.split('/');
    const folder = parts[parts.length - 2];
    if (folder && folder.startsWith('Transition')) {
      const base = folder.replace(/^Transition/i, '');
      const emotionParts = base.match(/[A-Z][a-z]+/g) ?? [];
      
      if (emotionParts.length >= 2) {
        const from = emotionParts[0] as Emotion;
        const to = emotionParts[1] as Emotion;
        
        if (EMOTIONS.includes(from) && EMOTIONS.includes(to)) {
          videos.push({
            href: url as string,
            from,
            to
          });
        }
      }
    }
  }
  
  console.log(`[transitions] Found ${videos.length} videos from static imports`);
  return videos;
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
