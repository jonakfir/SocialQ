#!/usr/bin/env node
/**
 * Populate EkmanImage table from the web app's assets/ekman folder only.
 * Run: cd web/backend && node scripts/populate-ekman.js
 * Requires DATABASE_URL. Inserts are marked folder='canonical'.
 * Mirroring game uses ONLY these canonical images (no admin-uploaded "Ekman" photos).
 * Repopulate after adding/removing images in frontend/src/lib/assets/ekman.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

const assetsBase = path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'assets', 'ekman');

function generateId() {
  return randomBytes(16).toString('hex');
}

function fileToBase64Sync(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  let mimeType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';
  const base64 = buf.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

function scanDir(dir, relativePath, images) {
  const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('Transition')) {
        scanDir(fullPath, relPath, images);
      }
    } else if (entry.isFile()) {
      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
      if (extensions.has(ext)) {
        const parts = relPath.split(path.sep);
        if (parts.length >= 2) {
          const folder = parts[parts.length - 2];
          const [label, difficulty] = folder.split('_');

          if (EMOTIONS.includes(label)) {
            try {
              const imageData = fileToBase64Sync(fullPath);
              images.push({
                id: generateId(),
                imageData,
                label,
                difficulty: difficulty || '1'
              });
              console.log(`  ✓ ${relPath} -> ${label}_${difficulty || '1'}`);
            } catch (err) {
              console.error(`  ✗ Error reading ${fullPath}:`, err.message);
            }
          }
        }
      }
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required. Set it in .env or as an environment variable.');
    process.exit(1);
  }

  if (!fs.existsSync(assetsBase)) {
    console.error(`❌ Ekman assets not found at: ${assetsBase}`);
    console.error('   Run this script from the project root (SocialQ/web/backend).');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    console.log('📸 Scanning Ekman images...');
    const images = [];
    scanDir(assetsBase, '', images);
    console.log(`\n📊 Found ${images.length} images`);

    if (images.length === 0) {
      console.warn('⚠️  No images found');
      process.exit(0);
    }

    await pool.query('DELETE FROM "EkmanImage"');
    console.log('🗑️  Cleared existing EkmanImage rows');

    const FOLDER_CANONICAL = 'canonical'; // Only these are used for mirroring (from web app assets/ekman folder)
    const batchSize = 10;
    let inserted = 0;

    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      const placeholders = batch.map((_, idx) => {
        const base = (i + idx) * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      }).join(', ');
      const params = batch.flatMap(img => [img.id, img.imageData, img.label, img.difficulty, FOLDER_CANONICAL]);

      try {
        await pool.query(
          `INSERT INTO "EkmanImage" ("id", "imageData", "label", "difficulty", "folder") VALUES ${placeholders}`,
          params
        );
        inserted += batch.length;
      } catch (err) {
        for (const img of batch) {
          try {
            await pool.query(
              'INSERT INTO "EkmanImage" ("id", "imageData", "label", "difficulty", "folder") VALUES ($1, $2, $3, $4, $5)',
              [img.id, img.imageData, img.label, img.difficulty, FOLDER_CANONICAL]
            );
            inserted++;
          } catch (e) {
            console.error(`  ✗ Insert failed ${img.label}_${img.difficulty}:`, e.message);
          }
        }
      }
    }

    console.log(`✅ Inserted ${inserted} Ekman images`);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
