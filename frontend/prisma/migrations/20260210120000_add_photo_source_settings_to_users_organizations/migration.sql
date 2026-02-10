-- Add photoSourceSettings to users and organizations (mapped table names used by Prisma)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photoSourceSettings" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "photoSourceSettings" TEXT;
