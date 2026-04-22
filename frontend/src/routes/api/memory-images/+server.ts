/**
 * GET /api/memory-images
 * Returns { emotion: string, images: string[] }[] — URLs to local Ekman images
 * for use in the memory game when the DB is not available.
 * In production the DB takes precedence via the page server loader.
 */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EKMAN_BASE = path.resolve(__dirname, '..', '..', '..', '..', 'lib', 'assets', 'ekman');

// Map folder prefix → our engine emotion id
const FOLDER_MAP: Record<string, string> = {
  Happy:    'happy',
  Anger:    'angry',
  Sad:      'sad',
  Fear:     'fearful',
  Disgust:  'disgusted',
  Surprise: 'surprised',
};

export const GET: RequestHandler = async () => {
  const result: Record<string, string[]> = {};

  for (const [prefix, emotionId] of Object.entries(FOLDER_MAP)) {
    result[emotionId] = [];
    // Pull from _1, _2, _3, _4 subfolders
    for (let tier = 1; tier <= 4; tier++) {
      const dir = path.join(EKMAN_BASE, `${prefix}_${tier}`);
      if (!existsSync(dir)) continue;
      try {
        const files = await readdir(dir);
        for (const f of files) {
          if (!/\.(png|jpg|jpeg|webp)$/i.test(f)) continue;
          result[emotionId].push(`/api/memory-image/${prefix}_${tier}/${f}`);
          if (result[emotionId].length >= 12) break;
        }
      } catch {}
      if (result[emotionId].length >= 12) break;
    }
  }

  return json(result);
};
