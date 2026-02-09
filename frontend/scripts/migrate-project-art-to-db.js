// Ingest project art (characters, faces, bubs, etc.) into ProjectAsset table.
// Run from frontend: npm run migrate-project-art
// Optional: PROJECT_ART_DIR=/path/to/folder npm run migrate-project-art

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

// Load .env so DATABASE_URL is available
dotenv.config({ path: envPath });
if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync(envPath, 'utf8');
    const match = raw.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
    if (match) process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
}

// Pass URL explicitly so Prisma doesn't need to read env("DATABASE_URL") from schema
const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? { datasources: { db: { url: process.env.DATABASE_URL } } }
    : undefined
);

const DEFAULT_ART_DIR = path.join(__dirname, '..', 'src', 'lib', 'assets', 'project-art');
const ART_DIR = process.env.PROJECT_ART_DIR || DEFAULT_ART_DIR;

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function keyFromFilename(name) {
  const base = path.basename(name, path.extname(name));
  return base
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[()]/g, '')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '') || 'asset';
}

function categoryFromKey(key) {
  if (key.startsWith('bub')) return 'bub';
  if (key.startsWith('faces') || key.startsWith('faces1big')) return 'faces';
  if (key.startsWith('girl')) return 'girl';
  if (key.startsWith('bellx1') || key.startsWith('hf_')) return 'characters';
  return 'other';
}

async function fileToDataUrl(filePath) {
  const buffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = EXT_MIME[ext] || 'application/octet-stream';
  const base64 = buffer.toString('base64');
  return { mimeType, data: `data:${mimeType};base64,${base64}` };
}

async function main() {
  console.log('🎨 Migrating project art to database...');
  console.log('   Source:', ART_DIR);

  const extensions = new Set(Object.keys(EXT_MIME));
  const entries = await readdir(ART_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && extensions.has(path.extname(e.name).toLowerCase()));

  if (files.length === 0) {
    console.log('⚠️  No image/video files found in', ART_DIR);
    process.exit(0);
    return;
  }

  const seen = new Set();
  const assets = [];

  for (const entry of files) {
    const fullPath = path.join(ART_DIR, entry.name);
    let key = keyFromFilename(entry.name);
    if (seen.has(key)) {
      let n = 1;
      while (seen.has(key + '_' + n)) n++;
      key = key + '_' + n;
    }
    seen.add(key);

    try {
      const { mimeType, data } = await fileToDataUrl(fullPath);
      const category = categoryFromKey(key);
      assets.push({ key, category, mimeType, data });
      console.log('  ✓', entry.name, '->', key, `(${category})`);
    } catch (err) {
      console.error('  ✗', entry.name, err.message);
    }
  }

  console.log('\n📊 Total:', assets.length, 'assets');

  try {
    await prisma.projectAsset.deleteMany({});
    console.log('🗑️  Cleared existing project assets');
  } catch (e) {
    console.warn('⚠️  Clear failed (table may not exist yet):', e.message);
  }

  let inserted = 0;
  for (const a of assets) {
    try {
      await prisma.projectAsset.create({ data: a });
      inserted++;
    } catch (e) {
      console.error('  ✗ Insert', a.key, e.message);
    }
  }

  console.log('💾 Inserted', inserted, '/', assets.length);
  console.log('✅ Done. Call GET /api/project-assets or GET /api/project-assets/[key] to use.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
