// src/routes/transitions/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { readdir, stat } from 'fs/promises';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const EMOTIONS = ['Anger','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
type Emotion = typeof EMOTIONS[number];

// Use Node fs API instead of import.meta.glob to avoid Vite scanning files at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const assetsBase = join(__dirname, '../../lib/assets/ekman');

async function getAllVideos(): Promise<Array<{ path: string; url: string; from: Emotion; to: Emotion }>> {
  const videos: Array<{ path: string; url: string; from: Emotion; to: Emotion }> = [];
  const extensions = new Set(['.mp4', '.webm']);

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
          // path like: TransitionAngryHappy/AngryHappy1.mp4
          const parts = relPath.split(sep);
          if (parts.length >= 2) {
            const folder = parts[parts.length - 2]; // "TransitionAngryHappy"
            const base = folder.replace(/^Transition/i, ''); // "AngryHappy"
            const emotionParts = base.match(/[A-Z][a-z]+/g) ?? [];
            
            if (emotionParts.length >= 2) {
              const from = emotionParts[0] as Emotion;
              const to = emotionParts[1] as Emotion;
              
              if (EMOTIONS.includes(from) && EMOTIONS.includes(to)) {
                const urlPath = relPath.replace(/\\/g, '/');
                videos.push({
                  path: relPath,
                  url: `/src/lib/assets/ekman/${urlPath}`,
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
  } catch (err) {
    console.error('Error scanning transition videos:', err);
  }

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
let videoCache: Array<{ path: string; url: string; from: Emotion; to: Emotion }> | null = null;

export const GET: RequestHandler = async () => {
  // Load videos once and cache
  if (!videoCache) {
    videoCache = await getAllVideos();
  }

  const rows = videoCache.map((v) => ({
    href: v.url,
    from: v.from,
    to: v.to
  }));

  shuffle(rows);
  return json(rows);
};
