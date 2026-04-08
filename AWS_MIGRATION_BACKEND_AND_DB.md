# Path A — Backend + DB on AWS (Checklist)

Use this after reading **`AWS_MIGRATION_GUIDE.md`**. Region example: **us-east-2** (must match ECR and App Runner).

---

## Phase 1 — RDS

- [ ] Create RDS PostgreSQL (version compatible with Railway).
- [ ] Enable **Publicly accessible** if Vercel/App Runner connect over the internet.
- [ ] Security group: **PostgreSQL 5432** from your IP (admin) and from App Runner / `0.0.0.0/0` as appropriate.
- [ ] Note **endpoint**, **port**, **username**, **password** (store password in Secrets Manager for production).
- [ ] From local machine: `pg_dump "$RAILWAY_DATABASE_URL" --no-owner --no-acl -f socialq_backup.sql`
- [ ] If restore errors on `transaction_timeout`: `sed -i.bak '/transaction_timeout/d' socialq_backup.sql` then `psql` restore.
- [ ] Restore: `psql "postgresql://USER:ENCODED_PASSWORD@HOST:5432/DBNAME" -f socialq_backup.sql`
- [ ] Verify row counts / spot-check tables.

---

## Phase 2 — ECR + image

- [ ] ECR → Create repository (e.g. `socialq-backend`) in **same region** as App Runner.
- [ ] `aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.us-east-2.amazonaws.com`
- [ ] From `web/backend`: `docker build -t socialq-backend:TAG .`
- [ ] `docker tag ... ACCOUNT.dkr.ecr.us-east-2.amazonaws.com/socialq-backend:TAG`
- [ ] `docker push ...:TAG`
- [ ] Prefer **unique tags** (`v1`, `20250407`) over relying only on `latest` for rollbacks.

---

## Phase 3 — App Runner

- [ ] Create service → **Container registry** → ECR image + tag.
- [ ] **Region** = ECR region (e.g. us-east-2).
- [ ] Port **8080**; env **`PORT=8080`**.
- [ ] Health check: **TCP** on 8080 (or HTTP `/` or `/health` once app is stable).
- [ ] CPU / memory: start modest; increase if startup is slow.
- [ ] Environment variables: mirror Railway (see below).
- [ ] **`DATABASE_URL`** = RDS connection string (SSL params if required by RDS).
- [ ] **`FRONTEND_ORIGIN`**, **`FRONTEND_URL`**, **`AUTH_SECRET`**, **`PROXY_SECRET`**, Stripe, WhatsApp, RevenueCat, email, etc.
- [ ] **`PUBLIC_API_URL`** / internal URLs = App Runner default URL until custom domain.
- [ ] Enable **Observability** → CloudWatch logs.

---

## Phase 4 — Vercel

- [ ] `DATABASE_URL` (and `DIRECT_URL` if used) → RDS.
- [ ] `PUBLIC_API_URL` → `https://YOUR_APP_RUNNER_URL`
- [ ] Redeploy frontend.

---

## Phase 5 — Third parties

- [ ] Stripe webhook URL → new API base.
- [ ] RevenueCat webhook → new API base.
- [ ] WhatsApp / Meta callback → new API base.
- [ ] Any other callbacks (email links, etc.).

---

## Phase 6 — Cutover & cleanup

- [ ] Smoke test: login, quiz flow, payments in test mode.
- [ ] Monitor CloudWatch for errors.
- [ ] Decommission Railway backend/DB when satisfied.

---

## Debugging quick reference

| Symptom | Check |
|--------|--------|
| ECR repo “empty” in wrong console | AWS region dropdown = **us-east-2** |
| `docker push` 403 | ECR login again |
| RDS connection timeout | SG + public access + correct host |
| App Runner unhealthy | TCP 8080; `server-minimal.js` in Dockerfile CMD to isolate; new image tag |
| Password auth failed | URL-encoding or `PGPASSWORD` |

---

## Files in repo

- **`web/backend/Dockerfile`** — `CMD ["node", "server.js"]`
- **`web/backend/server-minimal.js`** — minimal listener for platform tests
- **`web/backend/server.js`** — early bind + `loadRestOfApp()`
