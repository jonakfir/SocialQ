# Quiz "No images" debugging

When the **iOS app** shows "No quiz images available" but **Admin → Generated Photos** has images:

## 1. Confirm the frontend DB has images

Open in a browser (no auth needed):

```
https://YOUR_VERCEL_APP.vercel.app/api/quiz-images-status
```

- If `syntheticCount` is **78** (or > 0): the frontend database has the images. The problem is the **backend proxy** (step 2).
- If `syntheticCount` is **0**: the frontend is using a different DB or the table is empty; fix DATABASE_URL / run migrations.

## 2. Backend must proxy to the frontend

The iOS app calls your **backend** at `GET /ekman?photoType=synthetic&difficulty=...&count=...`. The backend must forward that to the **frontend** and send the shared secret.

On the **backend** (Railway, etc.) set:

| Env var | Example | Required |
|--------|---------|----------|
| `FRONTEND_URL` | `https://social-q-theta.vercel.app` | Yes (no trailing slash) |
| `PROXY_SECRET` or `BACKEND_PROXY_SECRET` | same value as below | Yes |

On the **frontend** (Vercel) set:

| Env var | Same value as backend `PROXY_SECRET` |
|--------|--------------------------------------|
| `BACKEND_PROXY_SECRET` | e.g. a long random string |

If the secret doesn’t match, the frontend returns **401** and the backend returns an empty list to the app.

## 3. Check logs

- **Vercel** (frontend): Look for `[ekman-quiz] Rejected` (bad secret) or `[ekman-quiz] No synthetic images` (DB returned 0).
- **Backend**: Look for `[ekman] photoType=synthetic requested but FRONTEND_URL or PROXY_SECRET not set` or `Frontend proxy returned 401`.

## 4. Test the proxy by hand (optional)

From a terminal (replace URL and secret):

```bash
curl -s -H "X-Proxy-Secret: YOUR_SECRET" "https://YOUR_VERCEL_APP.vercel.app/api/ekman-quiz?photoType=synthetic&difficulty=all&count=2"
```

- If you get a JSON array of 2 questions: frontend and secret are correct; fix backend env (FRONTEND_URL + PROXY_SECRET).
- If you get `{"ok":false,"error":"Unauthorized"}`: the header value is wrong (secret mismatch).
