-- Add missing columns with defaults so existing rows are preserved (no data loss).
-- Fixes: users.username, users.updatedAt; adds Collage.approvedAnyway.

-- users.updatedAt: required with default
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- users.username: required unique; backfill existing rows then set NOT NULL
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;
UPDATE "users" SET "username" = 'user-' || "id" WHERE "username" IS NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

-- Collage.approvedAnyway (for Unverified Photos feature)
ALTER TABLE "Collage" ADD COLUMN IF NOT EXISTS "approvedAnyway" BOOLEAN DEFAULT false;
