// src/routes/transitions/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { readdir } from 'fs/promises';
import { join, sep } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '$lib/db';

const EMOTIONS = ['Anger','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
type Emotion = typeof EMOTIONS[number];

// Get transition videos from database (preferred) or filesystem (fallback)
async function getAllVideos(): Promise<Array<{ href: string; from: Emotion; to: Emotion }>> {
  try {
    // Try to fetch from database first
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
        href: v.videoData, // Already base64 data URL
        from: v.from as Emotion,
        to: v.to as Emotion
      }));
    }
    
    // Fallback to filesystem if database is empty
    console.log('[transitions] Database empty, falling back to filesystem...');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = join(__filename, '..');
    const assetsBase = join(__dirname, '../../lib/assets/ekman');
    const videos: Array<{ href: string; from: Emotion; to: Emotion }> = [];
    const extensions = new Set(['.mp4', '.webm']);

    async function scanDir(dir: string, relativePath: string = '') {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          if (entry.name.startsWith('Transition')) {
            await scanDir(fullPath, relPath);
          }
        } else if (entry.isFile()) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (extensions.has(ext)) {
            const parts = relPath.split(sep);
            if (parts.length >= 2) {
              const folder = parts[parts.length - 2];
              const base = folder.replace(/^Transition/i, '');
              const emotionParts = base.match(/[A-Z][a-z]+/g) ?? [];
              
              if (emotionParts.length >= 2) {
                const from = emotionParts[0] as Emotion;
                const to = emotionParts[1] as Emotion;
                
                if (EMOTIONS.includes(from) && EMOTIONS.includes(to)) {
                  const urlPath = relPath.replace(/\\/g, '/');
                  videos.push({
                    href: `/src/lib/assets/ekman/${urlPath}`,
                    from,
                    to
                  });
                }
              }
            }
          }
        }
      }
    }

    try {
      await scanDir(assetsBase);
      console.log(`[transitions] Found ${videos.length} videos from filesystem`);
    } catch (err) {
      console.error('[transitions] Error scanning filesystem:', err);
    }

    return videos;
  } catch (err) {
    console.error('[transitions] Error:', err);
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
