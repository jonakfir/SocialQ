# Final WhatsApp Webhook Troubleshooting

## Current Status
- ✅ WABA subscribed to app
- ✅ App in Live mode
- ✅ Webhook verified
- ✅ "messages" event subscribed
- ❌ Real messages not triggering webhooks

## Critical Steps After Switching to Live Mode

### Step 1: Re-verify Webhook
After switching to Live mode, you MUST re-verify the webhook:

1. Go to: https://developers.facebook.com/apps/1493031701729261/whatsapp-business/wa-settings/
2. In "Webhook" section, click **"Edit"**
3. Click **"Verify and save"** again (even if already verified)
4. Wait for green checkmark ✅

### Step 2: Re-subscribe "messages" Event
Sometimes the subscription needs to be refreshed:

1. In the same page, scroll to "Webhook fields"
2. Find "messages" in the list
3. Toggle it **OFF** (wait 5 seconds)
4. Toggle it **ON** again
5. Wait 1-2 minutes

### Step 3: Verify Webhook URL is Correct
Make sure the webhook URL in Meta is:
```
https://socialq-production.up.railway.app/webhooks/whatsapp
```

**NOT:**
- ❌ `https://social-q-theta.vercel.app/api/webhooks/whatsapp` (Vercel URL)
- ❌ Any URL with trailing slash
- ❌ Any localhost URL

### Step 4: Check Phone Number Configuration
The phone number itself might need to be linked:

1. Go to: https://business.facebook.com/latest/whatsapp_manager/phone_numbers
2. Click on your phone number (`+1 555 646 5813`)
3. Check if there's a "Webhooks" or "Subscriptions" tab
4. Make sure webhooks are enabled for that number

### Step 5: Wait and Test Again
After re-verifying:
1. Wait 2-3 minutes for changes to propagate
2. Send a test message
3. Check Railway logs immediately

## Common Issues After Live Mode Switch

### Issue 1: Webhook URL Changed
- Meta might have reset the webhook URL
- Check and update if needed

### Issue 2: Subscription Lost
- Switching modes can reset subscriptions
- Re-subscribe the "messages" event

### Issue 3: Phone Number Not Linked
- The phone number might not be linked to the webhook
- Check phone number settings in WhatsApp Manager

### Issue 4: Access Token Permissions
- Live mode might require different token permissions
- Regenerate access token after switching to Live mode

## Debug Commands

### Check WABA Subscription
```bash
curl "https://socialq-production.up.railway.app/debug/check-waba-subscription?waba_id=1301560021226248"
```

### Test Webhook Endpoint
```bash
curl -X POST "https://socialq-production.up.railway.app/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"messages":[{"from":"1234567890","text":{"body":"test"}}]}}]}]}'
```

## If Still Not Working

1. **Check Meta's Webhook Delivery Logs:**
   - Meta Dashboard → WhatsApp → Configuration
   - Look for "Webhook Delivery" or "Activity Log"
   - Check for any failed deliveries

2. **Regenerate Access Token:**
   - Meta Dashboard → WhatsApp → API Setup
   - Generate a new access token
   - Update `WHATSAPP_TOKEN` in Railway

3. **Contact Meta Support:**
   - If everything is configured correctly but still not working
   - This might be a Meta platform issue

## Success Indicators

When it's working, you'll see:
- ✅ POST requests in Railway HTTP Logs: `POST /webhooks/whatsapp 200`
- ✅ Detailed logs in Railway Deploy Logs: `[WA Webhook] Incoming message: {...}`
- ✅ Messages appear within 10-15 seconds of sending

