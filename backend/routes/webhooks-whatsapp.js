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
  console.log('WA webhook event:', JSON.stringify(req.body, null, 2));
  // TODO: handle messages, statuses, etc.
  res.sendStatus(200);
});

module.exports = router;
