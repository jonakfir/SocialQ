// frontend/src/lib/whatsapp.ts
import { env } from '$env/dynamic/private';

type TextParam = { type: 'text'; text: string };
type BodyComponent = { type: 'body'; parameters: TextParam[] };

/**
 * Use the same Graph API version that works with your cURL tests
 * (you tested with v22.0).
 */
const GRAPH_VERSION = 'v22.0';

/**
 * Normalize E.164 destination. Meta examples typically omit "+".
 * We'll strip a leading '+' so either format works when you call us.
 */
function normalizeTo(to: string): string {
  return String(to || '').trim().replace(/^\+/, '');
}

export async function sendWhatsAppTemplate(opts: {
  to: string;
  template: string;
  lang?: string;                // default 'en_US'
  components?: BodyComponent[]; // optional
}) {
  // Use dynamic environment variables (available at runtime, not build time)
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) {
    throw new Error(
      'WhatsApp env not set (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)'
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizeTo(opts.to),
    type: 'template',
    template: {
      name: opts.template,
      language: { code: opts.lang || 'en_US' },
      components: opts.components || []
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[WhatsApp] send error', res.status, text);
    throw new Error(`WhatsApp send failed: ${res.status} ${text}`);
  }
}
