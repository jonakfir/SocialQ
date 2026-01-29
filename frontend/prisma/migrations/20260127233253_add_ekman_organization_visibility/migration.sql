-- Migration: Add photoType and organization visibility to EkmanImage
-- Created: 2026-01-27

-- Add photoType column to EkmanImage table
ALTER TABLE "EkmanImage" ADD COLUMN IF NOT EXISTS "photoType" TEXT NOT NULL DEFAULT 'ekman';

-- Create EkmanImageOrganizationVisibility table
CREATE TABLE IF NOT EXISTS "EkmanImageOrganizationVisibility" (
    "id" TEXT NOT NULL,
    "ekmanImageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EkmanImageOrganizationVisibility_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for ekmanImageId and organizationId
CREATE UNIQUE INDEX IF NOT EXISTS "EkmanImageOrganizationVisibility_ekmanImageId_organizationId_key" 
    ON "EkmanImageOrganizationVisibility"("ekmanImageId", "organizationId");

-- Create indexes
CREATE INDEX IF NOT EXISTS "EkmanImageOrganizationVisibility_ekmanImageId_idx" 
    ON "EkmanImageOrganizationVisibility"("ekmanImageId");

CREATE INDEX IF NOT EXISTS "EkmanImageOrganizationVisibility_organizationId_idx" 
    ON "EkmanImageOrganizationVisibility"("organizationId");

-- Create index on photoType
CREATE INDEX IF NOT EXISTS "EkmanImage_photoType_idx" 
    ON "EkmanImage"("photoType");

-- Add foreign key constraints
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'EkmanImageOrganizationVisibility_ekmanImageId_fkey'
    ) THEN
        ALTER TABLE "EkmanImageOrganizationVisibility" 
        ADD CONSTRAINT "EkmanImageOrganizationVisibility_ekmanImageId_fkey" 
        FOREIGN KEY ("ekmanImageId") REFERENCES "EkmanImage"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'EkmanImageOrganizationVisibility_organizationId_fkey'
    ) THEN
        ALTER TABLE "EkmanImageOrganizationVisibility" 
        ADD CONSTRAINT "EkmanImageOrganizationVisibility_organizationId_fkey" 
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
