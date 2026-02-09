# Connect Vercel (frontend) to Railway Postgres

The admin panel and all `/api/*` routes run on **Vercel**. They use Prisma and need a Postgres connection. That connection must be set in **Vercel**, not Railway.

## What to set on Vercel

1. Open your Vercel project → **Settings** → **Environment Variables**.
2. Add (or edit):

   **Name:** `DATABASE_URL`  
   **Value:** Your Railway Postgres **public** URL.

   Example (use the one from your Railway Postgres service, **with `?sslmode=require`** for external connections):

   ```
   postgresql://postgres:YOUR_PASSWORD@ballast.proxy.rlwy.net:25477/railway?sslmode=require
   ```

   - In Railway: Postgres service → **Variables** → copy **`DATABASE_PUBLIC_URL`**, then add **`?sslmode=require`** at the end.
   - No space after `postgres:` in the URL.
   - Use that full value as `DATABASE_URL` on Vercel.

3. Apply to **Production** (and Preview if you use it).
4. **Redeploy** the project (Deployments → … → Redeploy) so the new variable is used.

After this, the admin Users list and other Prisma-backed routes will use the same database as your Railway backend.
