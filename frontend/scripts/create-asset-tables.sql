-- SQL script to create EkmanImage and TransitionVideo tables
-- Run this manually if Prisma migration doesn't work

CREATE TABLE IF NOT EXISTS "EkmanImage" (
    "id" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EkmanImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EkmanImage_label_idx" ON "EkmanImage"("label");
CREATE INDEX IF NOT EXISTS "EkmanImage_difficulty_idx" ON "EkmanImage"("difficulty");
CREATE INDEX IF NOT EXISTS "EkmanImage_label_difficulty_idx" ON "EkmanImage"("label", "difficulty");

CREATE TABLE IF NOT EXISTS "TransitionVideo" (
    "id" TEXT NOT NULL,
    "videoData" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransitionVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TransitionVideo_from_idx" ON "TransitionVideo"("from");
CREATE INDEX IF NOT EXISTS "TransitionVideo_to_idx" ON "TransitionVideo"("to");
CREATE INDEX IF NOT EXISTS "TransitionVideo_from_to_idx" ON "TransitionVideo"("from", "to");

