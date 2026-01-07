# WhatsApp Webhook Setup: Railway + Vercel

## 🎯 Your Current Setup

- **Backend:** Railway (`socialq-production.up.railway.app`)
- **Frontend:** Vercel (`social-q-theta.vercel.app` or your custom domain)
- **Webhook URL:** Goes through Vercel frontend → proxies to Railway backend

---

## 📍 Step 1: Add WHATSAPP_VERIFY_TOKEN to Railway

**Where:** Railway Dashboard → Your Backend Service → Variables Tab

1. Go to [Railway Dashboard](https://railway.app)
2. Select your **SocialIQ** service (the backend)
3. Click on the **"Variables"** tab
4. Click **"+ New Variable"**
5. Add:
   - **Key:** `WHATSAPP_VERIFY_TOKEN`
   - **Value:** `your_secret_token_here` (choose a random string, e.g., `wab_verify_abc123xyz789`)
6. Click **"Add"**
7. **Redeploy** your service (Railway should auto-redeploy, or click "Redeploy")

**Important:** 
- No quotes around the value
- No spaces before/after
- Keep this secret - don't share it publicly
- You'll need this exact value for Meta dashboard

---

## 🔗 Step 2: Determine Your Webhook URL

Your webhook URL depends on your Vercel deployment:

**Option A: If using Vercel default domain:**
```
https://social-q-theta.vercel.app/api/webhooks/whatsapp
```

**Option B: If using custom domain:**
```
https://yourdomain.com/api/webhooks/whatsapp
```

**How it works:**
- Meta sends request to: `https://your-vercel-domain.com/api/webhooks/whatsapp`
- Vercel frontend receives it
- Frontend proxies to Railway backend: `https://socialq-production.up.railway.app/webhooks/whatsapp`
- Backend processes the webhook

**To find your exact Vercel URL:**
1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Domains**
4. Use the production domain listed there

---

## 🔧 Step 3: Configure Webhook in Meta Dashboard

**Where:** Meta Developer Portal → WhatsApp → Configuration → Webhook

1. Go to: https://developers.facebook.com/apps/1493031701729261/whatsapp-business/wa-settings/
2. Scroll down to **"Webhook"** section
3. Click **"Edit"** or **"Add Callback URL"**

4. **Enter Webhook Details:**
   - **Callback URL:** 
     ```
     https://social-q-theta.vercel.app/api/webhooks/whatsapp
     ```
     (Replace with your actual Vercel domain)
   
   - **Verify Token:** 
     ```
     your_secret_token_here
     ```
     (Enter the **exact same value** you set in Railway)
   
   - **Subscription Fields:** Check these:
     - ✅ `messages` (to receive incoming messages)
     - ✅ `message_template_status_update` (optional, for delivery status)

5. Click **"Verify and Save"**
   - Meta will send a GET request to your webhook
   - If successful, you'll see a green checkmark ✅
   - If it fails, check Railway logs for errors

---

## 🔍 Step 4: Where to See/Edit Verify Token in Meta

**Important:** The verify token is **NOT stored** in Meta's dashboard. You **set it** when configuring the webhook.

**To see/edit it:**
1. Go to Meta Developer Portal → WhatsApp → Configuration
2. Find the **"Webhook"** section
3. Click **"Edit"** next to your webhook URL
4. You'll see the **"Verify Token"** field where you can view/edit it
5. Make sure it matches exactly what's in Railway

**Note:** If you change the verify token in Meta, you must also update it in Railway (and vice versa) - they must always match!

---

## ✅ Step 5: Verify Everything is Working

### Test 1: Check Railway Variables
- [ ] `WHATSAPP_VERIFY_TOKEN` is set in Railway
- [ ] `WHATSAPP_TOKEN` is set in Railway (your access token)
- [ ] `WHATSAPP_PHONE_NUMBER_ID` is set in Railway

### Test 2: Check Webhook Verification
- [ ] Webhook shows green checkmark ✅ in Meta dashboard
- [ ] Railway logs show: `[Server] ✅ WhatsApp webhook routes mounted at /webhooks/whatsapp`

### Test 3: Test Webhook Endpoint
```bash
# Replace with your actual values
curl "https://social-q-theta.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Should return: test123
```

### Test 4: Check Event Subscriptions
- [ ] Go to Meta Dashboard → WhatsApp → Configuration
- [ ] Scroll to "Webhook Event Subscriptions"
- [ ] Make sure **"messages"** is **Subscribed** ✅ (toggle is blue)

### Test 5: Send a Test Message
- [ ] Send a message to your WhatsApp Business number
- [ ] Check Railway logs - you should see:
  ```
  [WA Webhook] Received event: {...}
  [WA Webhook] Incoming message: { from: '...', text: '...' }
  ```

---

## 🐛 Troubleshooting

### Webhook Verification Fails

**Check Railway Logs:**
1. Go to Railway → Your Service → **"Logs"** tab
2. Look for errors when Meta tries to verify
3. Common errors:
   - `403`: Verify token mismatch
   - `404`: Route not found (check URL path)
   - `500`: Server error (check logs)

**Common Issues:**
- ❌ Verify token has extra spaces/quotes in Railway
- ❌ Verify token doesn't match Meta dashboard exactly
- ❌ Webhook URL is wrong (should be through Vercel, not Railway directly)
- ❌ Frontend not proxying correctly (check `PUBLIC_API_URL` in Vercel)

### Not Receiving Messages

1. **Check Subscription Status:**
   - Meta Dashboard → WhatsApp → Configuration
   - Make sure "messages" event is **Subscribed** ✅

2. **Check Railway Logs:**
   - Look for `[WA Webhook] Received event` logs
   - If you see events but no messages, check the event structure

3. **Check Vercel Proxy:**
   - Make sure `PUBLIC_API_URL` is set in Vercel environment variables
   - Should point to: `https://socialq-production.up.railway.app`

4. **Test Direct Backend:**
   ```bash
   # Test if backend webhook works directly (bypassing Vercel)
   curl "https://socialq-production.up.railway.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
   # Should return: test
   ```

---

## 📝 Environment Variables Checklist

### Railway (Backend) - Required:
```bash
WHATSAPP_VERIFY_TOKEN=your_secret_token_here
WHATSAPP_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
```

### Vercel (Frontend) - Required:
```bash
PUBLIC_API_URL=https://socialq-production.up.railway.app
```

---

## 🎯 Quick Reference

**Your Webhook URL:**
```
https://social-q-theta.vercel.app/api/webhooks/whatsapp
```

**Where to set WHATSAPP_VERIFY_TOKEN:**
- ✅ Railway → SocialIQ Service → Variables → Add `WHATSAPP_VERIFY_TOKEN`
- ❌ NOT in Vercel (that's for frontend only)

**Where to configure webhook in Meta:**
- Meta Developer Portal → WhatsApp → Configuration → Webhook → Edit

**Where to see verify token in Meta:**
- It's in the webhook configuration form (when you click "Edit")
- It's NOT stored as a separate setting - you enter it when setting up the webhook

---

## ✅ Success Checklist

- [ ] `WHATSAPP_VERIFY_TOKEN` added to Railway variables
- [ ] Railway service redeployed
- [ ] Webhook URL configured in Meta: `https://your-vercel-domain.com/api/webhooks/whatsapp`
- [ ] Verify token in Meta matches Railway exactly
- [ ] Webhook verified successfully (green checkmark ✅)
- [ ] "messages" event is subscribed in Meta dashboard
- [ ] Test message sent and received in Railway logs

Once all checked, you should start receiving WhatsApp messages! 🎉

