-- Migration script to add folder management to EkmanImage and create OrganizationImageFolder table
-- Run this SQL directly on your PostgreSQL database

-- Step 1: Add folder column to EkmanImage table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'EkmanImage' AND column_name = 'folder'
    ) THEN
        ALTER TABLE "EkmanImage" ADD COLUMN "folder" TEXT DEFAULT 'ekman';
        CREATE INDEX IF NOT EXISTS "EkmanImage_folder_idx" ON "EkmanImage"("folder");
        CREATE INDEX IF NOT EXISTS "EkmanImage_folder_label_idx" ON "EkmanImage"("folder", "label");
    END IF;
END $$;

-- Step 2: Update existing images to have folder='ekman' if they don't have one
UPDATE "EkmanImage" SET "folder" = 'ekman' WHERE "folder" IS NULL OR "folder" = '';

-- Step 3: Create OrganizationImageFolder table
CREATE TABLE IF NOT EXISTS "OrganizationImageFolder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationImageFolder_pkey" PRIMARY KEY ("id")
);

-- Step 4: Create indexes for OrganizationImageFolder
CREATE INDEX IF NOT EXISTS "OrganizationImageFolder_organizationId_idx" ON "OrganizationImageFolder"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationImageFolder_folder_idx" ON "OrganizationImageFolder"("folder");

-- Step 5: Create unique constraint for organizationId + folder
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'OrganizationImageFolder_organizationId_folder_key'
    ) THEN
        ALTER TABLE "OrganizationImageFolder" 
        ADD CONSTRAINT "OrganizationImageFolder_organizationId_folder_key" 
        UNIQUE ("organizationId", "folder");
    END IF;
END $$;

-- Step 6: Add foreign key constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'OrganizationImageFolder_organizationId_fkey'
    ) THEN
        ALTER TABLE "OrganizationImageFolder" 
        ADD CONSTRAINT "OrganizationImageFolder_organizationId_fkey" 
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Verify the changes
SELECT 
    'EkmanImage folder column' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'EkmanImage' AND column_name = 'folder'
    ) THEN '✓ Exists' ELSE '✗ Missing' END as status
UNION ALL
SELECT 
    'OrganizationImageFolder table' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'OrganizationImageFolder'
    ) THEN '✓ Exists' ELSE '✗ Missing' END as status;
