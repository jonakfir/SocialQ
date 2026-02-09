# Set up friend photos (FRONTEND_URL + PROXY_SECRET)

So the iOS app can show a friend’s saved photos, the **backend (Railway)** must proxy to the **frontend (Vercel)**. Do these two steps once.

---

## 1. Generate a shared secret (one-time)

Use this secret in both Railway and Vercel (copy it somewhere safe):

```
socq-proxy-a7f2b9c4e1d8
```

Or generate your own (e.g. a long random string). Both sides must use the **exact same** value.

---

## 2. Railway (backend)

1. Open [Railway](https://railway.app) → your project → **backend** service.
2. Go to the **Variables** tab.
3. Add or edit:

| Name            | Value |
|-----------------|--------|
| `FRONTEND_URL`  | `https://social-q-theta.vercel.app` |
| `PROXY_SECRET`  | `socq-proxy-a7f2b9c4e1d8` (or the secret you chose) |

4. Save. Railway will redeploy the backend automatically.

---

## 3. Vercel (frontend)

1. Open [Vercel](https://vercel.com) → your project (the SvelteKit/frontend app).
2. Go to **Settings** → **Environment Variables**.
3. Add:

| Name                    | Value |
|-------------------------|--------|
| `BACKEND_PROXY_SECRET`  | `socq-proxy-a7f2b9c4e1d8` (same as `PROXY_SECRET` on Railway) |

4. Apply to **Production** (and Preview if you want).
5. **Redeploy** the frontend so the new variable is used: Deployments → ⋮ on latest → **Redeploy**.

---

## Done

After both are set and redeployed, open a friend’s profile in the iOS app (e.g. Joseph). Their photos should load. If not, check Railway logs for `[friend-photos]` messages.
