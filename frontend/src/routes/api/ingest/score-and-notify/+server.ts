// frontend/src/routes/api/ingest/score-and-notify/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendWhatsAppTemplate } from '$lib/whatsapp';
import { scoreEmotion } from '$lib/scoring';

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Expect multipart/form-data with fields: file, whatsapp_to
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const waTo = String(form.get('whatsapp_to') || '');

    if (!file || !waTo) {
      return new Response('file+whatsapp_to required', { status: 400 });
    }

    // Read the uploaded image into a buffer for scoring
    const buf = Buffer.from(await file.arrayBuffer());

    // 1) Score the emotion from the image
    const { emotion, confidence } = await scoreEmotion(buf);

    // 2) Notify via WhatsApp template
    await sendWhatsAppTemplate({
      to: waTo,
      template: 'emotion_report_v1',     // <-- EXACT template name you created in WhatsApp Manager
      lang: 'en_US',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: emotion },                          // {{emotion}}
            { type: 'text', text: (confidence * 100).toFixed(1) + '%' } // {{confidence}}
          ]
        }
      ]
    });

    return json({ ok: true, emotion, confidence });
  } catch (e: any) {
    // Surface detailed errors to server logs
    const detail =
      e?.response?.data || e?.data || e?.message || e?.toString?.() || e;
    console.error('[score-and-notify] error:', detail);

    // User-facing message
    const msg =
      e?.response?.data?.error?.message ||
      e?.message ||
      'Internal Error';
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
