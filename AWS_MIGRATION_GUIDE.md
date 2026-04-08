# Moving SocialQ to AWS — Scope & Steps

This guide covers migrating from **Vercel + Railway** to AWS (backend + database first; frontend can stay on Vercel).

---

## Current stack

| Component   | Current | Notes |
|------------|---------|--------|
| **Frontend** | Vercel | SvelteKit, `@sveltejs/adapter-vercel`, shares Postgres |
| **Backend**  | Railway | Express, `node server.js` |
| **Database** | Railway Postgres | Single DB for frontend + backend |
| **Assets**   | In DB | Base64 in Postgres (no S3) |
| **Integrations** | Env vars | Stripe, RevenueCat, WhatsApp, optional Resend/SMTP |

---

## Effort overview

| Path | What moves | Rough effort |
|------|------------|--------------|
| **A. Backend + DB only** | RDS + Express on AWS; Vercel stays | **1–2 days** |
| **B. Full AWS** | Frontend on Amplify/S3+CF too | **+1–2 days** |

**Recommendation:** Do Path A first.

---

## Path A — Backend + database

### 1. RDS PostgreSQL

- Create RDS (match Postgres major version, e.g. 15).
- **Public access** = Yes if Vercel and App Runner must reach it (tighten security groups later).
- Security group: inbound **5432** from your IP (for `pg_dump`/`psql`) and **0.0.0.0/0** or App Runner/VPC only once you know your traffic pattern.
- Export: `pg_dump "$DATABASE_URL" --no-owner --no-acl -f backup.sql`
- If restore fails on `transaction_timeout`, remove that line from the SQL or use a compatible dump format.
- Import: `psql "$RDS_URL" -f backup.sql` (after `sed '/transaction_timeout/d'` if needed).

### 2. Run backend on AWS

Options: **App Runner** (simplest), **Elastic Beanstalk**, **ECS Fargate**.

- **ECR:** Create repo, `docker build` from `web/backend`, `docker push`.
- **App Runner:** Region must match ECR (e.g. **us-east-2**). Image URI includes full tag (e.g. `minimal-v1` or `latest`).
- **Port:** **8080** in service config and `PORT=8080` env.
- **Health check:** **TCP** on 8080 often works when HTTP fails during debugging; ensure app binds `0.0.0.0`.
- **Observability:** Enable so application logs go to CloudWatch.

### 3. Backend env vars

Copy from Railway: `AUTH_SECRET`, `FRONTEND_ORIGIN`, `FRONTEND_URL`, `PROXY_SECRET`, Stripe, WhatsApp, RevenueCat, Resend, etc.

Set **`DATABASE_URL`** to RDS (not Railway). **`PUBLIC_API_URL`** / **`PRIVATE_API_BASE`** = your App Runner URL after the service is running.

### 4. Vercel

- `DATABASE_URL` and `DIRECT_URL` (if Prisma uses it) → RDS URL.
- `PUBLIC_API_URL` → new backend URL.
- Redeploy.

### 5. Webhooks

| Service    | Example path |
|-----------|--------------|
| Stripe    | `https://YOUR_API/stripe/webhook` |
| RevenueCat| `https://YOUR_API/revenuecat/webhook` |
| WhatsApp  | `https://YOUR_API/webhooks/whatsapp` |

### 6. Docker / server notes

- **`web/backend/Dockerfile`** — production CMD is `node server.js`.
- **`server-minimal.js`** — tiny HTTP server for isolating App Runner health-check issues; temporarily set `CMD ["node", "server-minimal.js"]` to verify the platform, then switch back.
- **`server.js`** — listens early (`/` + `/health`), then `loadRestOfApp()` in `setImmediate` so load balancers see port 8080 open even if a route throws later.

### 7. Common issues

- **ECR empty in App Runner:** Console region must match ECR (e.g. Ohio **us-east-2**).
- **RDS timeout:** Publicly accessible + security group inbound 5432.
- **Password in URL:** URL-encode `!` → `%21`, `?` → `%3F`, or use `PGPASSWORD=... psql` with connection params.
- **403 on `docker push`:** Re-run `aws ecr get-login-password ... | docker login ...`.
- **Stale `latest`:** Push a new tag (e.g. `v20250407`) and point App Runner at that tag.

---

## Path B — Frontend on AWS (optional)

- Switch SvelteKit adapter (e.g. **adapter-node** or Amplify’s pattern).
- **Amplify Hosting** or similar for SSR.
- Route 53 + ACM for custom domains.

---

See also: **`AWS_MIGRATION_BACKEND_AND_DB.md`** (Path A checklist) and **`AWS_MIGRATION_CLICK_BY_CLICK.md`** (detailed numbered steps).
