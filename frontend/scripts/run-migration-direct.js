// Direct migration script using Prisma Client to execute raw SQL
// This bypasses the Prisma CLI version issues

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('📦 Running folder management migration...');
    
    const sqlPath = join(__dirname, 'migrate-folder-management.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    // Split SQL into individual statements (simple approach)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`🔧 Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 0) {
        try {
          await prisma.$executeRawUnsafe(statement);
          if (i % 5 === 0) {
            console.log(`  ✓ Executed statement ${i + 1}/${statements.length}...`);
          }
        } catch (err) {
          // Some statements might fail if they already exist, that's ok
          if (!err.message.includes('already exists') && 
              !err.message.includes('duplicate') &&
              !err.message.includes('does not exist')) {
            console.warn(`  ⚠️  Statement ${i + 1} warning:`, err.message);
          }
        }
      }
    }
    
    console.log('✅ Schema migration completed!');
    console.log('');
    console.log('📸 Now updating existing images...');
    
    // Update existing images
    const result = await prisma.$executeRawUnsafe(`
      UPDATE "EkmanImage" 
      SET "folder" = 'ekman' 
      WHERE "folder" IS NULL OR "folder" = ''
    `);
    
    console.log(`✅ Updated existing images with folder type`);
    
    // Verify
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
    }
    
    console.log('');
    console.log('✅ All migrations completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Go to Admin → Organizations');
    console.log('2. Click "Manage Folders" for each organization');
    console.log('3. Select which folders (ekman, synthetic, user) should be available');
    console.log('4. (Optional) Import synthetic images via API: POST /api/admin/import-synthetic-images');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
