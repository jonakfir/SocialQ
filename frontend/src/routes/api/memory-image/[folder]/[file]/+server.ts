/**
 * GET /api/memory-image/[folder]/[file]
 * Serves individual Ekman image files from src/lib/assets/ekman/
 * Only used in local dev — production uses DB imageUrl (CDN/S3).
 */
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EKMAN_BASE = path.resolve(__dirname, '..', '..', '..', '..', '..', 'lib', 'assets', 'ekman');

function mimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

export const GET: RequestHandler = async ({ params }) => {
  // Sanitise — no path traversal
  const folder = params.folder.replace(/[^a-zA-Z0-9_\-]/g, '');
  const file   = params.file.replace(/[^a-zA-Z0-9_.\-]/g, '');

  const filePath = path.join(EKMAN_BASE, folder, file);

  if (!filePath.startsWith(EKMAN_BASE) || !existsSync(filePath)) {
    return new Response('Not found', { status: 404 });
  }

  const buf = await readFile(filePath);
  return new Response(buf, {
    headers: {
      'content-type': mimeType(file),
      'cache-control': 'public, max-age=86400',
    },
  });
};
