-- Add darkMode to User (used by profile/layout)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "darkMode" BOOLEAN NOT NULL DEFAULT false;
