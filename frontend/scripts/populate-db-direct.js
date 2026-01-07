// Direct database population using pg client (bypasses Prisma CLI issues)
import pg from 'pg';
import { readFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { join, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const assetsBase = join(__dirname, '..', 'src', 'lib', 'assets', 'ekman');

function generateId() {
  return randomBytes(16).toString('hex');
}

async function fileToBase64(filePath) {
  const fileBuffer = await readFile(filePath);
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  let mimeType = 'image/png';
  
  if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.mp4') mimeType = 'video/mp4';
  else if (ext === '.webm') mimeType = 'video/webm';
  
  const base64 = fileBuffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function ensureTables() {
  console.log('📝 Ensuring tables exist...');
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS "EkmanImage" (
        "id" TEXT NOT NULL,
        "imageData" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "difficulty" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EkmanImage_pkey" PRIMARY KEY ("id")
    );
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS "EkmanImage_label_idx" ON "EkmanImage"("label");
    CREATE INDEX IF NOT EXISTS "EkmanImage_difficulty_idx" ON "EkmanImage"("difficulty");
    CREATE INDEX IF NOT EXISTS "EkmanImage_label_difficulty_idx" ON "EkmanImage"("label", "difficulty");
  `);
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS "TransitionVideo" (
        "id" TEXT NOT NULL,
        "videoData" TEXT NOT NULL,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TransitionVideo_pkey" PRIMARY KEY ("id")
    );
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS "TransitionVideo_from_idx" ON "TransitionVideo"("from");
    CREATE INDEX IF NOT EXISTS "TransitionVideo_to_idx" ON "TransitionVideo"("to");
    CREATE INDEX IF NOT EXISTS "TransitionVideo_from_to_idx" ON "TransitionVideo"("from", "to");
  `);
  
  console.log('✅ Tables ensured');
}

async function populateImages() {
  console.log('📸 Populating Ekman images...');
  
  const images = [];
  const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

  async function scanDir(dir, relativePath = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('Transition')) {
            await scanDir(fullPath, relPath);
          }
        } else if (entry.isFile()) {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (extensions.has(ext)) {
            const parts = relPath.split(sep);
            if (parts.length >= 2) {
              const folder = parts[parts.length - 2];
              const [label, difficulty] = folder.split('_');
              
              if (EMOTIONS.includes(label)) {
                try {
                  const imageData = await fileToBase64(fullPath);
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
    } catch (err) {
      console.error(`Error scanning ${dir}:`, err.message);
    }
  }

  await scanDir(assetsBase);
  console.log(`\n📊 Found ${images.length} Ekman images`);
  
  if (images.length === 0) {
    console.warn('⚠️  No images found');
    return 0;
  }
  
  // Clear existing
  await client.query('DELETE FROM "EkmanImage"');
  console.log('🗑️  Cleared existing images');
  
  // Insert in batches
  console.log('💾 Inserting images...');
  const batchSize = 10;
  let inserted = 0;
  
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const values = batch.map((img, idx) => {
      const base = i + idx;
      return `($${base * 4 + 1}, $${base * 4 + 2}, $${base * 4 + 3}, $${base * 4 + 4})`;
    }).join(', ');
    
    const params = batch.flatMap(img => [img.id, img.imageData, img.label, img.difficulty]);
    
    try {
      await client.query(
        `INSERT INTO "EkmanImage" ("id", "imageData", "label", "difficulty") VALUES ${values}`,
        params
      );
      inserted += batch.length;
      console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${images.length})`);
    } catch (err) {
      console.error(`  ✗ Error inserting batch:`, err.message);
      // Try one by one
      for (const img of batch) {
        try {
          await client.query(
            'INSERT INTO "EkmanImage" ("id", "imageData", "label", "difficulty") VALUES ($1, $2, $3, $4)',
            [img.id, img.imageData, img.label, img.difficulty]
          );
          inserted++;
        } catch (e) {
          console.error(`    ✗ Error inserting ${img.label}_${img.difficulty}:`, e.message);
        }
      }
    }
  }
  
  console.log(`✅ Inserted ${inserted}/${images.length} images`);
  return inserted;
}

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    await ensureTables();
    const imageCount = await populateImages();
    
    console.log(`\n🎉 Done! ${imageCount} images in database`);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

