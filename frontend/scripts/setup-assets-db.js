// Setup script to create tables and populate assets in database
// This runs during Vercel build or can be run manually

import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { join, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

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

async function migrateEkmanImages() {
  console.log('📸 Migrating Ekman images to database...');
  
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

  try {
    await scanDir(assetsBase);
    console.log(`\n📊 Found ${images.length} Ekman images`);
    
    if (images.length === 0) {
      console.warn('⚠️  No images found to migrate');
      return 0;
    }
    
    // Clear existing images
    console.log('🗑️  Clearing existing Ekman images...');
    try {
      await prisma.ekmanImage.deleteMany({});
    } catch (err) {
      console.warn('⚠️  Could not clear existing images (table may not exist yet):', err.message);
    }
    
    // Insert all images in batches
    console.log('💾 Inserting images into database...');
    const batchSize = 10;
    let inserted = 0;
    
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      try {
        await prisma.ekmanImage.createMany({
          data: batch,
          skipDuplicates: true
        });
        inserted += batch.length;
        console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${images.length})`);
      } catch (err) {
        console.error(`  ✗ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, err.message);
        // Try inserting one by one
        for (const img of batch) {
          try {
            await prisma.ekmanImage.create({ data: img });
            inserted++;
          } catch (e) {
            console.error(`    ✗ Error inserting ${img.label}_${img.difficulty}:`, e.message);
          }
        }
      }
    }
    
    console.log(`✅ Successfully migrated ${inserted}/${images.length} Ekman images to database!`);
    return inserted;
  } catch (err) {
    console.error('❌ Error migrating Ekman images:', err);
    throw err;
  }
}

async function migrateTransitionVideos() {
  console.log('\n🎬 Migrating transition videos to database...');
  
  const videos = [];
  const extensions = new Set(['.mp4', '.webm']);

  async function scanDir(dir, relativePath = '') {
    try {
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
              const emotionParts = base.match(/[A-Z][a-z]+/g) || [];
              
              if (emotionParts.length >= 2) {
                const from = emotionParts[0];
                const to = emotionParts[1];
                
                if (EMOTIONS.includes(from) && EMOTIONS.includes(to)) {
                  try {
                    const videoData = await fileToBase64(fullPath);
                    videos.push({
                      id: generateId(),
                      videoData,
                      from,
                      to
                    });
                    console.log(`  ✓ ${relPath} -> ${from} -> ${to}`);
                  } catch (err) {
                    console.error(`  ✗ Error reading ${fullPath}:`, err.message);
                  }
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

  try {
    await scanDir(assetsBase);
    console.log(`\n📊 Found ${videos.length} transition videos`);
    
    if (videos.length === 0) {
      console.warn('⚠️  No videos found to migrate');
      return 0;
    }
    
    // Clear existing videos
    console.log('🗑️  Clearing existing transition videos...');
    try {
      await prisma.transitionVideo.deleteMany({});
    } catch (err) {
      console.warn('⚠️  Could not clear existing videos (table may not exist yet):', err.message);
    }
    
    // Insert all videos in batches
    console.log('💾 Inserting videos into database...');
    const batchSize = 10;
    let inserted = 0;
    
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      try {
        await prisma.transitionVideo.createMany({
          data: batch,
          skipDuplicates: true
        });
        inserted += batch.length;
        console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1} (${inserted}/${videos.length})`);
      } catch (err) {
        console.error(`  ✗ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, err.message);
        // Try inserting one by one
        for (const video of batch) {
          try {
            await prisma.transitionVideo.create({ data: video });
            inserted++;
          } catch (e) {
            console.error(`    ✗ Error inserting ${video.from}->${video.to}:`, e.message);
          }
        }
      }
    }
    
    console.log(`✅ Successfully migrated ${inserted}/${videos.length} transition videos to database!`);
    return inserted;
  } catch (err) {
    console.error('❌ Error migrating transition videos:', err);
    throw err;
  }
}

async function main() {
  try {
    console.log('🚀 Starting asset migration to database...\n');
    
    // First, ensure tables exist by trying to query them
    try {
      await prisma.ekmanImage.findFirst();
      console.log('✅ EkmanImage table exists');
    } catch (err) {
      console.error('❌ EkmanImage table does not exist. Please run: npx prisma db push');
      process.exit(1);
    }
    
    try {
      await prisma.transitionVideo.findFirst();
      console.log('✅ TransitionVideo table exists');
    } catch (err) {
      console.error('❌ TransitionVideo table does not exist. Please run: npx prisma db push');
      process.exit(1);
    }
    
    const imageCount = await migrateEkmanImages();
    const videoCount = await migrateTransitionVideos();
    
    console.log(`\n🎉 Migration complete!`);
    console.log(`   - ${imageCount} Ekman images migrated`);
    console.log(`   - ${videoCount} transition videos migrated`);
  } catch (err) {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();


