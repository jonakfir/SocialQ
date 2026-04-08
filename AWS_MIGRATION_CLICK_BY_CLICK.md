# AWS migration — click-by-click (Path A)

Detailed steps for **RDS + ECR + App Runner** with **Vercel** still hosting the frontend. Example region: **us-east-2** (Ohio). Replace account IDs, hostnames, and passwords with yours.

---

## Part 0 — Prerequisites

1. AWS account with permissions for RDS, ECR, App Runner, IAM (for App Runner access roles), CloudWatch.
2. AWS CLI configured (`aws configure`) if using CLI for ECR login and optional automation.
3. Docker installed locally.
4. Railway `DATABASE_URL` (or connection string) for export.
5. Railway env vars exported or copied (for App Runner).

---

## Part 1 — RDS PostgreSQL

### 1.1 Create subnet group (if none exists)

1. AWS Console → **RDS** → **Subnet groups** → **Create DB subnet group**.
2. Choose VPC and at least two subnets in different AZs.

### 1.2 Create security group for RDS

1. **EC2** → **Security Groups** → **Create security group**.
2. Name e.g. `socialq-rds-sg`, VPC same as RDS.
3. **Inbound:** Type **PostgreSQL**, port **5432**, source **My IP** (for `pg_dump` / `psql`).
4. Add second inbound rule: **PostgreSQL** **5432**, source **0.0.0.0/0** *only if* you need open internet access (tighten to App Runner / Vercel egress later if you use fixed IPs or VPC connector).

### 1.3 Create database

1. **RDS** → **Create database**.
2. Engine: **PostgreSQL**, version aligned with Railway (e.g. 15.x).
3. Template: **Dev/Test** or **Production** as appropriate.
4. DB instance identifier: e.g. `socialq-prod`.
5. Master username / password — **save password**; special characters must be **URL-encoded** in `DATABASE_URL` or use `PGPASSWORD` with `psql` params.
6. Instance class: start small (e.g. `db.t3.micro` or `db.t4g.micro`).
7. Storage: General purpose, enable autoscaling if desired.
8. **Connectivity:** VPC, subnet group, **Public access = Yes** (if Vercel/App Runner are not in same VPC).
9. VPC security group: select `socialq-rds-sg`.
10. **Create database**. Wait until status is **Available**. Copy **endpoint** (hostname).

### 1.4 Export from Railway

On your machine (replace URL):

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -f socialq_backup.sql
```

If PostgreSQL 17+ features appear and restore fails, use a matching client or adjust dump options.

### 1.5 Fix `transaction_timeout` (if restore fails)

```bash
sed -i.bak '/transaction_timeout/d' socialq_backup.sql
```

### 1.6 Restore to RDS

Encode password in URL or use:

```bash
export PGPASSWORD='your-password'
psql -h YOUR_RDS_ENDPOINT -p 5432 -U YOUR_USER -d postgres -f socialq_backup.sql
```

Or single URL (encode `!` as `%21`, etc.):

```bash
psql "postgresql://USER:ENCODED_PASSWORD@YOUR_RDS_ENDPOINT:5432/DBNAME" -f socialq_backup.sql
```

### 1.7 Verify

```bash
psql "$RDS_URL" -c "\dt"
psql "$RDS_URL" -c "SELECT COUNT(*) FROM some_table;"
```

---

## Part 2 — ECR

### 2.1 Repository

1. Console region: **us-east-2** (must match App Runner).
2. **ECR** → **Repositories** → **Create repository**.
3. Name: e.g. `socialq-backend`, **Private**.

### 2.2 Build and push (CLI)

```bash
cd web/backend
docker build -t socialq-backend:v1 .
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-2.amazonaws.com
docker tag socialq-backend:v1 123456789012.dkr.ecr.us-east-2.amazonaws.com/socialq-backend:v1
docker push 123456789012.dkr.ecr.us-east-2.amazonaws.com/socialq-backend:v1
```

If **403** on push: login again; confirm region and account ID in the registry URL.

---

## Part 3 — App Runner

### 3.1 IAM roles

App Runner needs:

- **ECR access** role (pull images from your repo).
- **Instance** role if the app calls other AWS APIs (optional for basic Express + RDS over public URL).

Follow the wizard’s **Create new role** defaults when prompted.

### 3.2 Create service

1. **App Runner** → **Create service** (region **us-east-2**).
2. **Source:** Container registry → **Amazon ECR** → select image **and tag** (e.g. `v1`).
3. **Deployment settings:** Automatic or manual; deployment trigger as you prefer.
4. **Service settings:**
   - **Port:** `8080`
   - **Environment variables:** add `PORT=8080`, `DATABASE_URL`, `AUTH_SECRET`, `FRONTEND_ORIGIN`, `FRONTEND_URL`, `PROXY_SECRET`, Stripe keys, WhatsApp tokens, RevenueCat, etc. (copy from Railway).
5. **Health check:** **TCP**, port **8080** (or HTTP path `/` or `/health`).
6. **CPU / memory:** increase if logs show slow startup or OOM.
7. **Observability:** enable **CloudWatch** for application logs.
8. **Create & deploy**. Wait for **Running** and **Health check** success.

### 3.3 If deployment fails or stays unhealthy

1. **CloudWatch** → log group for the service → read startup errors (DB connection, missing env, crash).
2. Temporarily change Dockerfile **CMD** to `["node", "server-minimal.js"]`, rebuild, push **new tag** (e.g. `minimal-v1`), update App Runner to that tag — if this goes healthy, the platform is fine; fix `server.js` / env / DB.
3. Confirm **RDS** accepts connections from App Runner (security group + public access).
4. Confirm **no region mismatch** between ECR image and App Runner console.

### 3.4 Copy service URL

Default URL looks like `https://xxxxx.us-east-2.awsapprunner.com`. Use this for `PUBLIC_API_URL` on Vercel and for webhook base URLs.

---

## Part 4 — Vercel

1. Project → **Settings** → **Environment Variables**.
2. Set `DATABASE_URL` (and `DIRECT_URL` if Prisma uses it) to RDS.
3. Set `PUBLIC_API_URL` to App Runner HTTPS URL.
4. **Redeploy** production (and preview if needed).

---

## Part 5 — Webhooks & external services

1. **Stripe** Dashboard → Webhooks → endpoint `https://YOUR_APP_RUNNER_HOST/stripe/webhook` — copy signing secret into App Runner env.
2. **RevenueCat** → webhook URL `https://YOUR_APP_RUNNER_HOST/revenuecat/webhook`.
3. **Meta / WhatsApp** → callback `https://YOUR_APP_RUNNER_HOST/webhooks/whatsapp` (or your configured path).
4. Save all secrets in App Runner env (or Secrets Manager + reference if you adopt that pattern).

---

## Part 6 — Post-migration

1. End-to-end test: sign-in, core API calls, Stripe test payment, WhatsApp test if applicable.
2. Watch **CloudWatch** for 24–48 hours.
3. When stable, scale down or delete **Railway** backend and database resources.

---

## Reference — repo files

| File | Purpose |
|------|--------|
| `web/backend/Dockerfile` | Image build; default `node server.js` |
| `web/backend/server-minimal.js` | Minimal HTTP server for health-check isolation |
| `web/backend/server.js` | Express app; early listen + deferred `loadRestOfApp()` |
| `web/backend/.dockerignore` | Keeps `.env` and junk out of image |

---

## Reference — env vars to mirror from Railway

Typical names (confirm in your `.env` / Railway dashboard):

- `DATABASE_URL`, `NODE_ENV`, `PORT`
- `AUTH_SECRET`, `FRONTEND_ORIGIN`, `FRONTEND_URL`, `PROXY_SECRET`
- `PUBLIC_API_URL`, `PRIVATE_API_BASE` (or equivalents your code uses)
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key if server needs it
- WhatsApp / Meta tokens and verify tokens
- RevenueCat keys / webhook secret
- Email: Resend or SMTP variables

---

*Last aligned with SocialQ backend layout: Express in `web/backend`, Vercel frontend in `web/frontend`.*
