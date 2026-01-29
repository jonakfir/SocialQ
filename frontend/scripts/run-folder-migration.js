// Script to run the folder management migration using Prisma
// This will use Prisma's db push functionality

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  try {
    console.log('📦 Running Prisma db push to apply schema changes...');
    
    // Change to frontend directory
    const frontendDir = join(__dirname, '..');
    process.chdir(frontendDir);
    
    // Try to run prisma db push
    console.log('🔧 Applying database schema changes...');
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'inherit',
      cwd: frontendDir
    });

    console.log('✅ Schema migration completed!');
    console.log('');
    console.log('📸 Now updating existing images...');
    
    // Run the update script
    execSync('node scripts/update-ekman-folder-type.js', {
      stdio: 'inherit',
      cwd: frontendDir
    });

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
    console.error('');
    console.error('Alternative: You can run the SQL migration manually:');
    console.error('  psql $DATABASE_URL -f scripts/migrate-folder-management.sql');
    process.exit(1);
  }
}

runMigration();
