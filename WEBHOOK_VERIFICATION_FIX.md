# Fixing Webhook Verification Error

## 🔴 Current Error
"The callback URL or verify token couldn't be validated. Please verify the provided information or try again later."

## ✅ Step-by-Step Fix

### Step 1: Verify Token is Set in Railway

1. **Go to Railway Dashboard:**
   - https://railway.app
   - Select your **SocialIQ** service
   - Go to **Variables** tab

2. **Check if `WHATSAPP_VERIFY_TOKEN` exists:**
   - Look for: `WHATSAPP_VERIFY_TOKEN`
   - Value should be: `wab_verify_abc123xyz789` (exactly as in Meta)
   - **No quotes, no spaces**

3. **If it doesn't exist or is wrong:**
   - Click **"+ New Variable"** (or edit existing)
   - Key: `WHATSAPP_VERIFY_TOKEN`
   - Value: `wab_verify_abc123xyz789`
   - Click **"Add"**
   - **Redeploy** the service (Railway should auto-redeploy)

### Step 2: Test Webhook URL Directly

Test if your webhook endpoint is accessible:

```bash
# Test the webhook verification endpoint
curl "https://social-q-theta.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wab_verify_abc123xyz789&hub.challenge=test123"
```

**Expected response:** `test123`

**If you get 403:**
- Token mismatch (check Railway variable matches exactly)

**If you get 404:**
- Route not found (check if frontend is proxying correctly)

**If you get 500:**
- Server error (check Railway logs)

### Step 3: Check Railway Logs

1. **Go to Railway Dashboard**
2. **Select SocialIQ service**
3. **Click "Logs" tab**
4. **Look for:**
   - `[Server] ✅ WhatsApp webhook routes mounted at /webhooks/whatsapp`
   - Any errors when Meta tries to verify

5. **When you click "Verify and save" in Meta, you should see:**
   ```
   GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...
   ```

### Step 4: Check Frontend Proxy Configuration

The frontend needs to proxy `/api/webhooks/whatsapp` to Railway backend.

**Check Vercel Environment Variables:**
1. Go to Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Check if `PUBLIC_API_URL` is set
5. Should be: `https://socialq-production.up.railway.app`

**If missing or wrong:**
- Add/Update: `PUBLIC_API_URL` = `https://socialq-production.up.railway.app`
- Redeploy frontend

### Step 5: Verify Token Exact Match

**Common mistakes:**
- ❌ Extra spaces: `wab_verify_abc123xyz789 ` (space at end)
- ❌ Quotes in Railway: `"wab_verify_abc123xyz789"` (should be without quotes)
- ❌ Different case: `WAB_VERIFY_ABC123XYZ789` (should match exactly)
- ❌ Different value in Meta vs Railway

**Fix:**
1. Copy the exact value from Railway (no spaces, no quotes)
2. Paste it into Meta's "Verify token" field
3. Make sure they match character-for-character

### Step 6: Test Backend Directly (Bypass Vercel)

If Vercel proxy is the issue, test Railway directly:

```bash
# Test Railway backend directly
curl "https://socialq-production.up.railway.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wab_verify_abc123xyz789&hub.challenge=test123"
```

**If this works but Vercel doesn't:**
- Frontend proxy issue
- Check `PUBLIC_API_URL` in Vercel
- Check frontend routing in `src/routes/api/[...path]/+server.ts`

### Step 7: Check CORS/Server Configuration

The webhook route should be accessible without CORS restrictions. We moved it before CORS middleware, but verify:

1. Check `backend/server.js`
2. Webhook route should be registered **before** CORS middleware
3. Should see:
   ```javascript
   // Mount WhatsApp webhook routes BEFORE CORS
   app.use('/webhooks', require('./routes/webhooks-whatsapp'));
   
   app.use(cors(corsOptions));
   ```

### Step 8: Retry Verification

After fixing any issues:

1. **Wait 1-2 minutes** for Railway to redeploy (if you changed variables)
2. **Go back to Meta Dashboard**
3. **Click "Verify and save" again**
4. **Check Railway logs** to see if request arrives

---

## 🔍 Debugging Checklist

Run through this checklist:

- [ ] `WHATSAPP_VERIFY_TOKEN` exists in Railway variables
- [ ] Token value in Railway matches Meta exactly (no quotes, no spaces)
- [ ] Railway service is running (check "Online" status)
- [ ] Railway logs show: `[Server] ✅ WhatsApp webhook routes mounted`
- [ ] `PUBLIC_API_URL` is set in Vercel environment variables
- [ ] Vercel frontend is deployed and accessible
- [ ] Direct Railway test works: `curl https://socialq-production.up.railway.app/webhooks/whatsapp?...`
- [ ] Vercel proxy test works: `curl https://social-q-theta.vercel.app/api/webhooks/whatsapp?...`
- [ ] Railway logs show GET request when Meta tries to verify

---

## 🆘 Still Not Working?

If verification still fails after all checks:

1. **Check Railway Logs** - Look for any errors when Meta sends the verification request
2. **Check Vercel Logs** - See if requests are reaching Vercel
3. **Try Different Verify Token** - Sometimes tokens with special characters cause issues
   - Use simple alphanumeric: `webhook_verify_123456`
4. **Check Network/Firewall** - Make sure Railway/Vercel aren't blocking Meta's IPs
5. **Verify Railway URL** - Make sure `socialq-production.up.railway.app` is correct

---

## 📝 Quick Test Commands

```bash
# Test 1: Railway backend directly
curl "https://socialq-production.up.railway.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wab_verify_abc123xyz789&hub.challenge=test123"

# Test 2: Through Vercel proxy
curl "https://social-q-theta.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wab_verify_abc123xyz789&hub.challenge=test123"

# Test 3: Check if endpoint exists (should return 403, not 404)
curl "https://social-q-theta.vercel.app/api/webhooks/whatsapp"
```

All should return `test123` (for test 1 & 2) or `403` (for test 3).

