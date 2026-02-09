-- Add folder column to Collage (Verified Photos / Unverified Photos from Upload flow)
ALTER TABLE "Collage" ADD COLUMN IF NOT EXISTS "folder" TEXT DEFAULT 'Me';
