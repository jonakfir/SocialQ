# Migrating Assets to Database

This guide explains how to migrate Ekman images and transition videos from the filesystem to the database.

## Problem

In Vercel (serverless), filesystem access is not available. All images and videos need to be stored in the database as base64 data URLs.

## Solution

1. **Database Schema**: Added `EkmanImage` and `TransitionVideo` models to Prisma schema
2. **Endpoints Updated**: `/ekman` and `/transitions` endpoints now fetch from database first, with filesystem fallback
3. **Migration Script**: `scripts/migrate-assets-to-db.js` converts all assets to base64 and stores them

## Steps to Migrate

### Option 1: Using Prisma (Recommended)

1. **Push schema to database:**
   ```bash
   cd frontend
   npm run prisma:db:push -- --accept-data-loss
   npm run prisma:generate
   ```

2. **Run migration script:**
   ```bash
   node scripts/migrate-assets-to-db.js
   ```

### Option 2: Using SQL (If Prisma fails)

1. **Create tables manually:**
   ```bash
   # Connect to your PostgreSQL database and run:
   psql $DATABASE_URL < scripts/create-asset-tables.sql
   ```

2. **Generate Prisma client:**
   ```bash
   npm run prisma:generate
   ```

3. **Run migration script:**
   ```bash
   node scripts/migrate-assets-to-db.js
   ```

## Verification

After migration, the endpoints should work:
- `/ekman?difficulty=1&count=12` - Should return images from database
- `/transitions` - Should return videos from database

Check the console logs to confirm images/videos are being loaded from the database.

## Notes

- The migration script processes ~110 Ekman images and all transition videos
- Images are stored as base64 data URLs (e.g., `data:image/png;base64,...`)
- Videos are stored as base64 data URLs (e.g., `data:video/mp4;base64,...`)
- The endpoints will fall back to filesystem if the database is empty (for local development)

