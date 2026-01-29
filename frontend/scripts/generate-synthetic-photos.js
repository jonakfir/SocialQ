/**
 * Generate synthetic face images for each Ekman emotion using OpenAI DALL·E 3
 * and store them in the database under "Generated Photos/{Emotion}".
 *
 * Requires: OPENAI_API_KEY and DATABASE_URL in .env (never commit the API key).
 * Run: node scripts/generate-synthetic-photos.js
 * Optional: --per-emotion N (default 2), --skip-existing (skip if folder already has images)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
const DEFAULT_PER_EMOTION = 2;
const FOLDER_PREFIX = 'Generated Photos';

// Emotion: clearly readable but not crazy – unmistakable, natural, not over the top
const SOFT_EMOTION_PHRASES = {
  Anger: 'obviously annoyed or irritated – furrowed brow, set jaw – but natural not exaggerated',
  Disgust: 'unmistakably disgusted – nose slightly wrinkled, mouth downturned, clear distaste – natural not over the top',
  Fear: 'obviously worried or uneasy – wide eyes, tense brow – but natural not dramatic',
  Happy: 'unmistakably happy – warm, genuine smile, eyes crinkled – natural not over the top',
  Neutral: 'a calm, relaxed neutral expression',
  Sad: 'obviously sad or downcast – downturned mouth, heavy eyes – but natural and restrained',
  Surprise: 'clearly surprised – raised eyebrows, slightly open mouth – natural not cartoonish',
};
function softEmotion(emotion) {
  return SOFT_EMOTION_PHRASES[emotion] ?? `a clear, readable ${emotion.toLowerCase()} expression, natural not exaggerated`;
}

// Normal, everyday settings – real environments, not studio backdrops
const NORMAL_SETTINGS = [
  'in a cozy café with soft natural light from the window, real environment',
  'in a living room with a sofa or bookshelf in the background, natural daylight',
  'at a kitchen table with morning light, casual home setting',
  'outdoors on a park bench or in a garden, dappled natural daylight',
  'in a home office or study with a desk and window, real room',
  'by a window in a normal room with curtains or plants, natural lighting',
  'in a casual restaurant or coffee shop, real-world setting',
];
function normalSetting(emotion) {
  const idx = EMOTIONS.indexOf(emotion);
  return NORMAL_SETTINGS[idx % NORMAL_SETTINGS.length];
}

function parseArgs() {
  const args = process.argv.slice(2);
  let perEmotion = DEFAULT_PER_EMOTION;
  let skipExisting = false;
  let realistic = false;
  let white = false;
  let maxTotal = null;
  let onlyEmotion = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--per-emotion' && args[i + 1]) {
      perEmotion = Math.max(1, parseInt(args[i + 1], 10) || DEFAULT_PER_EMOTION);
      i++;
    } else if (args[i] === '--skip-existing') {
      skipExisting = true;
    } else if (args[i] === '--realistic') {
      realistic = true;
    } else if (args[i] === '--white') {
      white = true;
    } else if (args[i] === '--max-total' && args[i + 1]) {
      maxTotal = Math.max(1, parseInt(args[i + 1], 10) || 1);
      i++;
    } else if (args[i] === '--only-emotion' && args[i + 1]) {
      const em = args[i + 1].charAt(0).toUpperCase() + args[i + 1].slice(1).toLowerCase();
      if (EMOTIONS.includes(em)) onlyEmotion = em;
      i++;
    }
  }
  return { perEmotion, skipExisting, realistic, white, maxTotal, onlyEmotion };
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  const contentType = res.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${base64}`;
}

async function generateImageWithOpenAI(emotion, options = {}) {
  const { realistic = false, white = false, maxRealism = false } = options;
  let prompt;
  const setting = normalSetting(emotion);
  // Soft lighting (no harsh contrast); not looking at camera; natural in scene; indistinguishable from real
  const realSkin = 'natural skin texture with visible pores and slight imperfections, not airbrushed, not retouched';
  const softLight = 'soft, even, diffused lighting – no harsh shadows, no strong contrast, gentle and even on the face';
  const inScene = 'person actually in the scene with same lighting on face and background';
  const notAtCamera = 'person not looking at the camera – looking slightly to the side or down, or natural gaze as if unaware of the camera; do not have subject stare at camera; soft framing, like they\'re just in the room';
  const relaxedNatural = 'relaxed and natural, like a friend took a quick snapshot – not posed, not stiff';
  const indistinguishable = 'indistinguishable from a real photograph; could pass for a real person\'s photo; does not look AI-generated';
  if (maxRealism && white) {
    prompt = `A candid photo of an ordinary Caucasian adult, neutral expression, relaxed, ${setting}. ${realSkin}. ${softLight}. ${inScene}. ${notAtCamera}. ${relaxedNatural}. ${indistinguishable}. Not perfect, not glossy. No text or cartoon.`;
  } else if (realistic && white) {
    prompt = `A candid photo of an ordinary Caucasian adult with ${softEmotion(emotion)}, ${setting}. One person, face clearly readable, relaxed. ${realSkin}. ${softLight}. ${inScene}. ${notAtCamera}. ${relaxedNatural}. ${indistinguishable}. No text or cartoon.`;
  } else if (realistic) {
    prompt = `A candid photo of an ordinary adult with ${softEmotion(emotion)}, ${setting}. One person, face clearly readable, relaxed. ${realSkin}. ${softLight}. ${inScene}. ${notAtCamera}. ${relaxedNatural}. ${indistinguishable}. No text or cartoon.`;
  } else if (white) {
    prompt = `A candid photo of a Caucasian adult with ${softEmotion(emotion)}, ${setting}. One person, face visible, relaxed. ${realSkin}. ${softLight}. ${notAtCamera}. No text or cartoon.`;
  } else {
    prompt = `A candid photo of an adult with ${softEmotion(emotion)}, ${setting}. One person, face visible, relaxed. ${realSkin}. ${softLight}. ${notAtCamera}. No text or cartoon.`;
  }
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      // Portrait 1024x1792 = higher resolution for faces; square 1024x1024 otherwise
      size: realistic ? '1024x1792' : '1024x1024',
      quality: realistic ? 'hd' : 'standard',
      style: realistic ? 'natural' : undefined, // "natural" = more natural faces, less hyper-real
      response_format: 'url',
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }
  const data = await response.json();
  const url = data.data?.[0]?.url;
  if (!url) throw new Error('No image URL in OpenAI response');
  return url;
}

async function main() {
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Set it in .env or environment.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Set it in .env or environment.');
    process.exit(1);
  }

  const { perEmotion, skipExisting, realistic, white, maxTotal, onlyEmotion } = parseArgs();
  const prisma = new PrismaClient();
  const emotionsToRun = onlyEmotion ? [onlyEmotion] : EMOTIONS;

  try {
    await prisma.$connect();
    console.log(`Generating up to ${perEmotion} image(s) per emotion (${emotionsToRun.length} emotion(s)). Skip existing: ${skipExisting}${realistic ? ' [realistic]' : ''}${white ? ' [Caucasian]' : ''}${maxTotal != null ? ` max ${maxTotal} total` : ''}${onlyEmotion ? ` [only ${onlyEmotion}]` : ''}`);
  } catch (e) {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  }

  let totalCreated = 0;
  const genOptions = { realistic, white, maxRealism: realistic && onlyEmotion === 'Neutral' };
  for (let e = 0; e < emotionsToRun.length; e++) {
    if (maxTotal != null && totalCreated >= maxTotal) break;
    const emotion = emotionsToRun[e];
    const folder = `${FOLDER_PREFIX}/${emotion}`;

    if (skipExisting) {
      const existing = await prisma.ekmanImage.count({
        where: { photoType: 'synthetic', folder },
      });
      if (existing >= perEmotion) {
        console.log(`[${e + 1}/${emotionsToRun.length}] ${emotion}: skipping (already ${existing} images)`);
        continue;
      }
    }

    const limitThisEmotion = maxTotal != null ? Math.min(perEmotion, maxTotal - totalCreated) : perEmotion;
    for (let i = 0; i < limitThisEmotion; i++) {
      try {
        console.log(`[${e + 1}/${emotionsToRun.length}] ${emotion} (${i + 1}/${limitThisEmotion}): generating...`);
        const imageUrl = await generateImageWithOpenAI(emotion, genOptions);
        const imageData = await fetchImageAsBase64(imageUrl);
        await prisma.ekmanImage.create({
          data: {
            imageData,
            label: emotion,
            difficulty: 'all',
            photoType: 'synthetic',
            folder,
          },
        });
        totalCreated++;
        console.log(`  ✓ Saved to ${folder}`);
      } catch (err) {
        console.error(`  ✗ ${emotion} (${i + 1}): ${err.message}`);
      }
      if (maxTotal != null && totalCreated >= maxTotal) break;
      // Rate limit: ~1 image/min on many accounts; wait 65s before next API call
      if (e < emotionsToRun.length - 1 || i < limitThisEmotion - 1) {
        console.log('  Waiting 65s for rate limit...');
        await new Promise((r) => setTimeout(r, 65000));
      }
    }
  }

  await prisma.$disconnect();
  console.log(`Done. Created ${totalCreated} synthetic images.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
