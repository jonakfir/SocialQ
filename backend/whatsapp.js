// backend/whatsapp.js
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const WABA_TOKEN = process.env.WHATSAPP_TOKEN;            // required
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;    // required (aka phone_number_id)

const base = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}`;

async function sendText({ to, text }) {
  const r = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WABA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });
  if (!r.ok) throw new Error(`WA text failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sendTemplate({ to, name, lang = 'en_US', components = [] }) {
  const r = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WABA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: lang }, components }
    })
  });
  if (!r.ok) throw new Error(`WA template failed: ${r.status} ${await r.text()}`);
  return r.json();
}

module.exports = { sendText, sendTemplate };
