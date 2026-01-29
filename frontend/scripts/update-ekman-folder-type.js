// Script to update existing EkmanImage records to have folder type 'ekman'
// Run: node scripts/update-ekman-folder-type.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateEkmanFolderType() {
  try {
    console.log('📸 Updating EkmanImage folder types...');
    
    // Update all existing images without a folder to have folder='ekman'
    const result = await prisma.ekmanImage.updateMany({
      where: {
        OR: [
          { folder: null },
          { folder: undefined }
        ]
      },
      data: {
        folder: 'ekman'
      }
    });
    
    console.log(`✅ Updated ${result.count} images with folder type 'ekman'`);
    
    // Also update any images that might have empty string
    const result2 = await prisma.ekmanImage.updateMany({
      where: {
        folder: ''
      },
      data: {
        folder: 'ekman'
      }
    });
    
    if (result2.count > 0) {
      console.log(`✅ Updated ${result2.count} additional images with empty folder`);
    }
    
    // Verify the update
    const totalImages = await prisma.ekmanImage.count();
    const imagesWithFolder = await prisma.ekmanImage.count({
      where: {
        folder: { not: null }
      }
    });
    
    console.log(`📊 Total images: ${totalImages}`);
    console.log(`📊 Images with folder type: ${imagesWithFolder}`);
    
    if (totalImages === imagesWithFolder) {
      console.log('✅ All images now have folder types!');
    } else {
      console.warn(`⚠️  ${totalImages - imagesWithFolder} images still missing folder type`);
    }
    
  } catch (error) {
    console.error('❌ Error updating folder types:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateEkmanFolderType()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

