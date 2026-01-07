# WhatsApp Webhook Troubleshooting Guide

## 🔍 Common Issues & Solutions

Since `WHATSAPP_VERIFY_TOKEN` is already set, here are other things to check:

---

## 1. ✅ Verify Token Mismatch

**Issue:** Token in `.env` doesn't match what's in Meta Dashboard

**Check:**
- Open `SocialQ_repo/backend/.env`
- Copy the exact value of `WHATSAPP_VERIFY_TOKEN` (no extra spaces, quotes, or newlines)
- Go to Meta Developer Portal → WhatsApp → Configuration → Webhook
- Make sure the "Verify Token" field matches **exactly** (case-sensitive)

**Common mistakes:**
- Extra spaces before/after the token
- Quotes around the token in `.env` (should be: `WHATSAPP_VERIFY_TOKEN=abc123`, NOT `WHATSAPP_VERIFY_TOKEN="abc123"`)
- Different token in Meta dashboard vs `.env`

---

## 2. 🌐 Webhook URL Accessibility

**Issue:** Meta can't reach your webhook URL

**Check your webhook URL:**

**If using local development:**
- ❌ `http://localhost:8080/webhooks/whatsapp` - **Won't work!** Meta can't reach localhost
- ✅ Use a public tunnel:
  ```bash
  # Option 1: ngrok
  ngrok http 8080
  # Use: https://abc123.ngrok.io/api/webhooks/whatsapp
  
  # Option 2: localtunnel
  npx localtunnel --port 8080
  # Use: https://abc123.loca.lt/api/webhooks/whatsapp
  ```

**If using production (Vercel/Railway):**
- ✅ `https://your-domain.com/api/webhooks/whatsapp`
- Make sure the URL is **HTTPS** (not HTTP)
- Make sure the domain is publicly accessible

**Test the URL:**
```bash
# Test GET (verification)
curl "https://your-domain.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Should return: test123

# Test POST (should return 200)
curl -X POST "https://your-domain.com/api/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
# Should return: 200 OK
```

---

## 3. 🔄 Frontend Proxy Configuration

**Issue:** Frontend not proxying webhook requests correctly

**Check:**
1. Is `PUBLIC_API_URL` set in your frontend environment?
   - For local dev: Should point to `http://localhost:8080` (or your backend port)
   - For production: Should point to your backend URL

2. The webhook route is at `/webhooks/whatsapp` in backend
   - Through frontend proxy: `/api/webhooks/whatsapp`
   - Direct to backend: `/webhooks/whatsapp`

3. **Important:** Meta needs to hit the **public URL**, which should be:
   - `https://your-frontend-domain.com/api/webhooks/whatsapp` (if frontend proxies)
   - OR `https://your-backend-domain.com/webhooks/whatsapp` (if backend is directly accessible)

---

## 4. 🚀 Server Not Running / Route Not Registered

**Issue:** Backend server not running or webhook route not loaded

**Check server logs when starting:**
```bash
# You should see:
[Server] ✅ WhatsApp webhook routes mounted at /webhooks/whatsapp
```

**If you DON'T see this:**
- The webhook route isn't being registered
- Check for errors in server startup
- Make sure `routes/webhooks-whatsapp.js` exists and is valid

**Test locally:**
```bash
# Start backend
cd SocialQ_repo/backend
npm start

# In another terminal, test the route:
curl "http://localhost:8080/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
# Should return: test
```

---

## 5. 📝 Webhook Subscription Status

**Issue:** Webhook verified but not subscribed to events

**Check in Meta Dashboard:**
1. Go to: WhatsApp → Configuration → Webhook
2. Find your phone number in the list
3. Click "Manage" next to it
4. Make sure **"messages"** is checked/subscribed ✅
5. If not subscribed, click to subscribe

---

## 6. 🔐 CORS / Security Issues

**Issue:** Server blocking Meta's requests

**Check `server.js` CORS configuration:**
- Meta's webhook requests come from `*.facebook.com` and `*.fbcdn.net`
- Make sure CORS allows these origins OR allows all origins for webhook endpoint

**Quick fix:** Add webhook route before CORS middleware, or allow all origins for webhook:
```javascript
// In server.js, before CORS middleware:
app.use('/webhooks', require('./routes/webhooks-whatsapp'));
// This way webhooks bypass CORS restrictions
```

---

## 7. 📱 Phone Number Not Added as Test Number

**Issue:** Can't receive messages because number isn't verified

**Check:**
1. Go to Meta Developer Portal → WhatsApp → API Setup
2. Under "Step 1: Select phone numbers"
3. Make sure your phone number is added as a **test number**
4. Or verify your phone number if using production

**For testing:**
- Add your phone number in "To:" field
- Send a test message using the curl command in Meta dashboard
- Check if you receive it

---

## 8. 🔍 Check Server Logs

**When Meta tries to verify webhook, you should see:**
```
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...
```

**When receiving messages, you should see:**
```
[WA Webhook] Received event: {...}
[WA Webhook] Incoming message: { from: '...', text: '...' }
```

**If you see errors:**
- 403: Verify token mismatch
- 404: Route not found (check URL path)
- 500: Server error (check logs for details)

---

## 9. 🔄 Restart After Changes

**After making any changes:**
1. ✅ Update `.env` file
2. ✅ Restart backend server
3. ✅ Wait for server to fully start
4. ✅ Try webhook verification again in Meta dashboard

---

## 10. 🧪 Step-by-Step Verification Test

**Test 1: Check route exists**
```bash
curl http://localhost:8080/webhooks/whatsapp
# Should return: 403 (not 404)
```

**Test 2: Test verification**
```bash
curl "http://localhost:8080/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
# Should return: test123
```

**Test 3: Test with wrong token**
```bash
curl "http://localhost:8080/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=test123"
# Should return: 403
```

**Test 4: Test POST (simulate message)**
```bash
curl -X POST http://localhost:8080/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"messages":[{"from":"1234567890","text":{"body":"test"}}]}}]}]}'
# Should return: 200 OK
# Check server logs for: [WA Webhook] Received event
```

---

## 🎯 Quick Checklist

Run through this checklist:

- [ ] `WHATSAPP_VERIFY_TOKEN` in `.env` matches Meta dashboard exactly (no quotes, no spaces)
- [ ] Backend server is running and accessible
- [ ] Webhook URL is publicly accessible (HTTPS, not localhost)
- [ ] Webhook URL path is correct: `/api/webhooks/whatsapp` (through frontend) or `/webhooks/whatsapp` (direct)
- [ ] Server logs show: `[Server] ✅ WhatsApp webhook routes mounted`
- [ ] Webhook is verified in Meta dashboard (green checkmark)
- [ ] Phone number is subscribed to "messages" events
- [ ] Your phone number is added as a test number in Meta
- [ ] Server logs show webhook requests when Meta tries to verify
- [ ] CORS allows Meta's requests (or webhook route is before CORS middleware)

---

## 🆘 Still Not Working?

If none of the above fixes it, check:

1. **Network/Firewall:** Is your server behind a firewall blocking Meta's IPs?
2. **SSL Certificate:** If using HTTPS, is the certificate valid?
3. **Rate Limiting:** Is your server rate-limiting Meta's requests?
4. **Load Balancer:** If behind a load balancer, is it forwarding requests correctly?

**Get more info:**
- Enable verbose logging in webhook handler
- Check Meta's webhook delivery logs in Developer Portal
- Use a webhook testing tool like webhook.site to verify your endpoint works

