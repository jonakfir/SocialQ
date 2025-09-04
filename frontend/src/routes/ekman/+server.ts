// src/routes/ekman/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';

const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

// From this file (routes/ekman) to your images (lib/assets/ekman) is ../../
const images = import.meta.glob('../../lib/assets/ekman/*/*.{png,jpg,jpeg,webp}', {
  eager: true,
  as: 'url'
}) as Record<string, string>;

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const GET: RequestHandler = ({ url }) => {
  const diff = (url.searchParams.get('difficulty') ?? '1').toString();
  console.log(`Fetching images for difficulty: ${diff}`);
  const count = Number(url.searchParams.get('count') ?? '12');

  // Build a bank of { img, label, difficulty }
  const bank = Object.entries(images).map(([path, href]) => {
    // path like: /src/lib/assets/ekman/Happy_3/PE3-21.png
    const folder = path.split('/').slice(-2, -1)[0]; // "Happy_3"
    const [label, difficulty] = folder.split('_');
    return { img: href, label, difficulty };
  });

  const pool = bank.filter((row) => (diff === 'all' ? true : row.difficulty === diff));
  if (pool.length === 0) return json([]); // client will show "No images found"

  shuffle(pool);
  const picked = pool.slice(0, Math.min(count, pool.length));
  const rows = picked.map((p) => {
    const distractors = shuffle(EMOTIONS.filter((e) => e !== p.label)).slice(0, 2);
    const options = shuffle([p.label, ...distractors]);
    return { img: p.img, options, correct: p.label };
  });

  return json(rows);
};
