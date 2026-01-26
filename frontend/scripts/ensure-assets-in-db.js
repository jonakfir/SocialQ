// Quick script to check and populate assets if needed
// Can be run manually or during build

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAndReport() {
  try {
    const imageCount = await prisma.ekmanImage.count();
    const videoCount = await prisma.transitionVideo.count();
    
    console.log(`📊 Database Status:`);
    console.log(`   - Ekman Images: ${imageCount}`);
    console.log(`   - Transition Videos: ${videoCount}`);
    
    if (imageCount === 0) {
      console.error('❌ No Ekman images in database!');
      console.error('   Run: node scripts/setup-assets-db.js');
      process.exit(1);
    }
    
    if (videoCount === 0) {
      console.warn('⚠️  No transition videos in database');
    }
    
    console.log('✅ Database has assets');
    return true;
  } catch (err) {
    console.error('❌ Error checking database:', err);
    if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
      console.error('   Tables do not exist. Run: npx prisma db push');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndReport();


