// Script to migrate Ekman images and transition videos from filesystem to database
// Run this once to populate the database with all assets as base64

import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { readdir } from 'fs/promises';
import { join, sep } from 'path';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

// Get the assets directory
const assetsBase = join(__dirname, '..', 'src', 'lib', 'assets', 'ekman');

async function fileToBase64(filePath) {
  const fileBuffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
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
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        // Skip transition folders
        if (!entry.name.startsWith('Transition')) {
          await scanDir(fullPath, relPath);
        }
      } else if (entry.isFile()) {
        const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
        if (extensions.has(ext)) {
          const parts = relPath.split(sep);
          if (parts.length >= 2) {
            const folder = parts[parts.length - 2]; // "Happy_3"
            const [label, difficulty] = folder.split('_');
            
            if (EMOTIONS.includes(label)) {
              try {
                const imageData = await fileToBase64(fullPath);
                images.push({
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

  try {
    await scanDir(assetsBase);
    console.log(`\n📊 Found ${images.length} Ekman images`);
    
    // Clear existing images
    console.log('🗑️  Clearing existing Ekman images...');
    try {
      await prisma.ekmanImage.deleteMany({});
    } catch (err) {
      console.warn('⚠️  Could not clear existing images (table may not exist yet):', err.message);
    }
    
    // Insert all images
    console.log('💾 Inserting images into database...');
    let inserted = 0;
    for (const img of images) {
      try {
        await prisma.ekmanImage.create({
          data: img
        });
        inserted++;
      } catch (err) {
        console.error(`  ✗ Error inserting image ${img.label}_${img.difficulty}:`, err.message);
      }
    }
    console.log(`  ✓ Inserted ${inserted}/${images.length} images`);
    
    console.log(`✅ Successfully migrated ${images.length} Ekman images to database!`);
    return images.length;
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
            const folder = parts[parts.length - 2]; // "TransitionAngryHappy"
            const base = folder.replace(/^Transition/i, ''); // "AngryHappy"
            const emotionParts = base.match(/[A-Z][a-z]+/g) || [];
            
            if (emotionParts.length >= 2) {
              const from = emotionParts[0];
              const to = emotionParts[1];
              
              if (EMOTIONS.includes(from) && EMOTIONS.includes(to)) {
                try {
                  const videoData = await fileToBase64(fullPath);
                  videos.push({
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
  }

  try {
    await scanDir(assetsBase);
    console.log(`\n📊 Found ${videos.length} transition videos`);
    
    // Clear existing videos
    console.log('🗑️  Clearing existing transition videos...');
    try {
      await prisma.transitionVideo.deleteMany({});
    } catch (err) {
      console.warn('⚠️  Could not clear existing videos (table may not exist yet):', err.message);
    }
    
    // Insert all videos
    console.log('💾 Inserting videos into database...');
    let inserted = 0;
    for (const video of videos) {
      try {
        await prisma.transitionVideo.create({
          data: video
        });
        inserted++;
      } catch (err) {
        console.error(`  ✗ Error inserting video ${video.from}->${video.to}:`, err.message);
      }
    }
    console.log(`  ✓ Inserted ${inserted}/${videos.length} videos`);
    
    console.log(`✅ Successfully migrated ${videos.length} transition videos to database!`);
    return videos.length;
  } catch (err) {
    console.error('❌ Error migrating transition videos:', err);
    throw err;
  }
}

async function main() {
  try {
    console.log('🚀 Starting asset migration to database...\n');
    
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

