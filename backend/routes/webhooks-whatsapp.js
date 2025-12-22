// backend/routes/webhooks-whatsapp.js
const express = require('express');
const router = express.Router();

// GET: verify
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST: events
router.post('/whatsapp', express.json(), (req, res) => {
  console.log('[WA Webhook] Received event:', JSON.stringify(req.body, null, 2));
  
  try {
    const body = req.body;
    
    // Handle webhook verification (if Meta sends it)
    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach((entry) => {
        entry.changes?.forEach((change) => {
          if (change.field === 'messages') {
            const value = change.value;
            
            // Handle incoming messages
            if (value.messages) {
              value.messages.forEach((message) => {
                console.log('[WA Webhook] Incoming message:', {
                  from: message.from,
                  messageId: message.id,
                  type: message.type,
                  timestamp: message.timestamp,
                  text: message.text?.body,
                  // Add more fields as needed
                });
                
                // TODO: Process the message here
                // You can save it to database, trigger actions, etc.
              });
            }
            
            // Handle message status updates (delivered, read, etc.)
            if (value.statuses) {
              value.statuses.forEach((status) => {
                console.log('[WA Webhook] Message status:', {
                  messageId: status.id,
                  status: status.status,
                  timestamp: status.timestamp,
                  recipientId: status.recipient_id,
                });
              });
            }
          }
        });
      });
    }
    
    // Always return 200 to acknowledge receipt
    res.sendStatus(200);
  } catch (error) {
    console.error('[WA Webhook] Error processing webhook:', error);
    // Still return 200 to prevent Meta from retrying
    res.sendStatus(200);
  }
});

module.exports = router;
