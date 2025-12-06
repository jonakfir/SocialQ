# PostgreSQL Migration Guide

## What Changed

✅ **Prisma schema** - Now uses PostgreSQL instead of SQLite
✅ **Migration script** - Migrates existing data from SQLite to PostgreSQL
✅ **Database connection** - All Prisma queries now use PostgreSQL

## Steps to Complete Migration

### 1. Set DATABASE_URL in Vercel

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add/Update `DATABASE_URL` with your Railway PostgreSQL connection string:
   ```
   postgresql://postgres:YOUR_PASSWORD@postgres.railway.internal:5432/railway
   ```
   OR use the public URL:
   ```
   postgresql://postgres:YOUR_PASSWORD@ballast.proxy.rlwy.net:25477/railway
   ```

### 2. Run Prisma Migrations (Creates Tables)

After Vercel deploys with the new DATABASE_URL:

**Option A: Via Vercel (Automatic)**
- Prisma will automatically generate the client and create tables on first run
- The `postinstall` script runs `prisma generate` automatically

**Option B: Locally (For Testing)**
```bash
cd frontend
export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway"
npm run prisma:migrate
npm run prisma:generate
```

### 3. Migrate Existing Data (If You Have SQLite Data)

If you have existing data in SQLite that you want to migrate:

```bash
cd frontend
export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway"
npm run migrate:prisma
```

**Note:** If you're starting fresh (no SQLite data), skip this step.

### 4. Verify Everything Works

1. ✅ Check admin dashboard - should show correct user count
2. ✅ Test login/logout
3. ✅ Test creating organizations
4. ✅ Test game sessions
5. ✅ Test analytics

## What's Now Using PostgreSQL

- ✅ User authentication (already was)
- ✅ User management
- ✅ Organizations
- ✅ Organization memberships
- ✅ Game sessions
- ✅ Game questions
- ✅ Collages
- ✅ Friend requests
- ✅ Friendships
- ✅ Analytics

## Troubleshooting

**Issue: "Prisma Client not initialized"**
- Solution: Make sure `DATABASE_URL` is set in Vercel and redeploy

**Issue: "Tables don't exist"**
- Solution: Run `prisma migrate dev` locally or wait for Prisma to create them on first run

**Issue: "Connection refused"**
- Solution: Check that `DATABASE_URL` uses the correct Railway PostgreSQL URL

## Next Steps

After migration is complete:
1. ✅ All data is in PostgreSQL
2. ✅ No more SQLite database needed
3. ✅ Everything persists across deployments
4. ✅ Single source of truth for all data

