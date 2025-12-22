// Subscribe WhatsApp Business Account to app for webhooks
// Run this once: node subscribe-waba.js

require('dotenv').config();
const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const WA_TOKEN = (process.env.WHATSAPP_TOKEN || '').trim();
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '1301560021226248'; // From your Meta dashboard
const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';

async function subscribeWABA() {
  if (!WA_TOKEN) {
    console.error('❌ WHATSAPP_TOKEN not set in .env');
    process.exit(1);
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/subscribed_apps`;
  
  console.log(`\n📡 Subscribing WABA ${WABA_ID} to app...`);
  console.log(`URL: ${url}\n`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (res.ok) {
      console.log('✅ Success! WABA subscribed to app.');
      console.log('Response:', JSON.stringify(data, null, 2));
      console.log('\n🎉 Your webhook should now receive real messages!');
    } else {
      console.error('❌ Failed to subscribe WABA');
      console.error('Status:', res.status);
      console.error('Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

subscribeWABA();

