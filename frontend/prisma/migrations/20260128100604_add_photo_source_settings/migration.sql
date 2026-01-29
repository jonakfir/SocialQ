-- Add photoSourceSettings to User and Organization
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoSourceSettings" TEXT;

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "photoSourceSettings" TEXT;
