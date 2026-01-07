# WhatsApp Webhook Setup Guide

## 🎯 Overview

To receive incoming WhatsApp messages, you need to configure a webhook in Meta's developer dashboard. This guide walks you through the complete setup.

---

## ✅ Prerequisites

1. **Backend server is running** and accessible
2. **Frontend server is running** (or deployed) - webhooks are proxied through `/api/webhooks/whatsapp`
3. **WhatsApp Business Account** is set up in Meta Developer Portal
4. **Access Token** is generated and refreshed (you've already done this)

---

## 📋 Step-by-Step Setup

### Step 1: Set the Verify Token Environment Variable

The webhook uses a verify token to authenticate Meta's webhook verification request.

**Set this in your backend `.env` file:**

```bash
WHATSAPP_VERIFY_TOKEN=your_secret_verify_token_here
```

**Important:** 
- Choose a strong, random string (e.g., `wab_verify_abc123xyz789`)
- Keep this secret - don't commit it to git
- You'll need to enter this exact value in Meta's dashboard

---

### Step 2: Determine Your Webhook URL

Your webhook endpoint is accessible at:

**If using local development:**
- You'll need a public URL (Meta can't reach `localhost`)
- Use a tunneling service like **ngrok** or **localtunnel**:
  ```bash
  # Using ngrok (install: brew install ngrok)
  ngrok http 5173
  
  # Or using localtunnel
  npx localtunnel --port 5173
  ```
- Your webhook URL will be: `https://your-ngrok-url.ngrok.io/api/webhooks/whatsapp`

**If deployed to production (Vercel):**
- Your webhook URL: `https://social-q-theta.vercel.app/api/webhooks/whatsapp`
- Or your custom domain: `https://yourdomain.com/api/webhooks/whatsapp`

---

### Step 3: Configure Webhook in Meta Developer Portal

1. **Go to Meta Developer Portal:**
   - Navigate to: https://developers.facebook.com/apps/
   - Select your app: **SocialIQ Backend**

2. **Navigate to WhatsApp Configuration:**
   - In the left sidebar, go to **Products** → **WhatsApp**
   - Click on **Configuration** (or **API Setup**)

3. **Set Up Webhook:**
   - Find the **"Webhook"** section
   - Click **"Edit"** or **"Add Callback URL"**

4. **Enter Webhook Details:**
   - **Callback URL:** Enter your webhook URL (from Step 2)
     - Example: `https://social-q-theta.vercel.app/api/webhooks/whatsapp`
   - **Verify Token:** Enter the exact value from your `.env` file
     - Example: `wab_verify_abc123xyz789`
   - **Subscription Fields:** Select the fields you want to receive:
     - ✅ `messages` (to receive incoming messages)
     - ✅ `message_status` (to receive delivery/read statuses)

5. **Verify the Webhook:**
   - Click **"Verify and Save"**
   - Meta will send a GET request to your webhook URL
   - If verification succeeds, you'll see a green checkmark ✅
   - If it fails, check:
     - Is your server running and accessible?
     - Is the verify token correct?
     - Are there any errors in your server logs?

---

### Step 4: Subscribe to Webhook Events

After verification:

1. **Subscribe to your phone number:**
   - In the **Configuration** page, find **"Webhook"** section
   - Click **"Manage"** next to your phone number
   - Make sure **"messages"** is subscribed ✅

2. **Test the Webhook:**
   - Send a test message to your WhatsApp Business number
   - Check your backend server logs - you should see:
     ```
     [WA Webhook] Received event: {...}
     [WA Webhook] Incoming message: { from: '...', text: '...' }
     ```

---

## 🔍 Troubleshooting

### Webhook Verification Fails

**Error:** "Webhook verification failed"

**Solutions:**
1. **Check server logs** - Look for the GET request to `/webhooks/whatsapp`
2. **Verify the token matches** - Compare `WHATSAPP_VERIFY_TOKEN` in `.env` with what you entered in Meta
3. **Check server is accessible** - Try accessing your webhook URL in a browser (should return 403, not 404)
4. **Check CORS** - Make sure your server allows GET requests to the webhook endpoint

### Not Receiving Messages

**Problem:** Webhook verified, but no messages are received

**Solutions:**
1. **Check subscription status:**
   - Go to Meta Developer Portal → WhatsApp → Configuration
   - Verify your phone number is subscribed to "messages" events

2. **Check server logs:**
   - Look for `[WA Webhook] Received event` logs
   - If you see events but no messages, check the event structure

3. **Test with a known number:**
   - Make sure you're sending from a number that's added as a test number in Meta
   - Or use your own verified number

4. **Check webhook URL is correct:**
   - The URL must be publicly accessible (HTTPS)
   - Must return 200 status for both GET (verification) and POST (events)

5. **Check backend is running:**
   - Make sure your backend server is running
   - Check that the webhook route is registered (should see log: `[Server] ✅ WhatsApp webhook routes mounted`)

### Webhook Returns 404

**Problem:** Meta can't reach your webhook URL

**Solutions:**
1. **Check the route is registered:**
   - Look for this log when starting the server: `[Server] ✅ WhatsApp webhook routes mounted at /webhooks/whatsapp`
   - If you don't see it, the route isn't registered

2. **Check the URL path:**
   - Should be: `/api/webhooks/whatsapp` (through frontend proxy)
   - Or: `/webhooks/whatsapp` (if accessing backend directly)

3. **Check frontend proxy:**
   - Make sure `PUBLIC_API_URL` is set correctly in frontend
   - The frontend should proxy `/api/*` requests to the backend

---

## 📝 Environment Variables Checklist

Make sure these are set in your backend `.env`:

```bash
# WhatsApp API
WHATSAPP_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=your_secret_verify_token_here  # ← NEW: Required for webhook

# Optional
WHATSAPP_TEMPLATE=emotion_report_v1
WHATSAPP_TEMPLATE_LANG=en_US
GRAPH_VERSION=v21.0
```

---

## 🧪 Testing the Webhook

### Test 1: Verification (GET request)

```bash
# Test locally
curl "http://localhost:8080/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"

# Should return: test123
```

### Test 2: Receive Message (POST request)

Send a message to your WhatsApp Business number from your phone, then check server logs for:
```
[WA Webhook] Received event: {...}
[WA Webhook] Incoming message: { from: '...', text: '...' }
```

---

## 📚 Additional Resources

- [Meta WhatsApp Webhooks Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Webhook Verification Guide](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

---

## ✅ Success Checklist

- [ ] `WHATSAPP_VERIFY_TOKEN` is set in backend `.env`
- [ ] Backend server is running and accessible
- [ ] Webhook URL is publicly accessible (HTTPS)
- [ ] Webhook is verified in Meta Developer Portal (green checkmark)
- [ ] Phone number is subscribed to "messages" events
- [ ] Test message sent and received in server logs

Once all items are checked, you should start receiving WhatsApp messages! 🎉

