// src/routes/transitions/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';

const EMOTIONS = ['Anger','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
type Emotion = typeof EMOTIONS[number];

// ⬇️ was '../../../lib/...'; correct is '../../lib/...'
const videos = import.meta.glob(
  '../../lib/assets/ekman/Transition*/*.{mp4,webm}',
  { eager: true, query: '?url', import: 'default' }
) as Record<string, string>;

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const GET: RequestHandler = () => {
  const rows = Object.entries(videos).map(([path, href]) => {
    // ex: /src/lib/assets/ekman/TransitionAngryHappy/AngryHappy1.mp4
    const folder = path.split('/').slice(-2, -1)[0] ?? '';     // "TransitionAngryHappy"
    const base = folder.replace(/^Transition/i, '');            // "AngryHappy"
    const parts = base.match(/[A-Z][a-z]+/g) ?? [];             // ["Angry","Happy"]
    if (parts.length < 2) return null;

    const from = parts[0] as Emotion;
    const to   = parts[1] as Emotion;
    if (!EMOTIONS.includes(from) || !EMOTIONS.includes(to)) return null;

    return { href, from, to };
  }).filter(Boolean) as Array<{ href:string; from:Emotion; to:Emotion }>;

  shuffle(rows);
  return json(rows);
};
