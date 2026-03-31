/**
 * Preloaded facial recognition quiz images. Fetched when the app first loads so by the time
 * the user opens the quiz (or logs in), images are already cached and no cold reload.
 */

export type QuizRow = { id?: string; img?: string; options: string[]; correct: string };

const QUESTION_COUNT = 8;

const cache: Partial<Record<string, QuizRow[]>> = {};
let preloadStarted = false;
let preloadDone: Promise<void> | null = null;

function getApiFetch(): (url: string) => Promise<Response> {
  return (url: string) => {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    return import('$lib/api').then(({ apiFetch }) => apiFetch(url));
  };
}

/** Preload quiz images for all difficulties so they're cached before user opens quiz or logs in. */
export function preloadQuizImages(): void {
  if (preloadStarted) return;
  preloadStarted = true;
  preloadDone = (async () => {
    const apiFetch = getApiFetch();
    const base = '/ekman';
    const params = (d: string) => `difficulty=${encodeURIComponent(d)}&count=${QUESTION_COUNT}&photoType=synthetic&light=1`;
    const difficulties = ['1', '2', '3', '4', 'all'];
    try {
      const responses = await Promise.all(
        difficulties.map((d) => apiFetch(`${base}?${params(d)}`))
      );
      const parse = async (r: Response) => {
        if (!r.ok) return [];
        const rows = await r.json();
        return Array.isArray(rows) ? rows.slice(0, QUESTION_COUNT) : [];
      };
      const results = await Promise.all(responses.map(parse));
      difficulties.forEach((d, i) => {
        if (results[i].length) cache[d] = results[i];
      });
    } catch {
      // Ignore; quiz will fetch on demand
    }
  })();
}

/** Get cached quiz rows for a difficulty, or null if not cached. */
export function getCachedQuizRows(difficulty: string): QuizRow[] | null {
  const key = difficulty === '5' ? 'all' : difficulty;
  const rows = cache[key];
  if (rows && rows.length > 0) return rows;
  return null;
}

/** Store fetched rows in cache for next time. */
export function setCachedQuizRows(difficulty: string, rows: QuizRow[]): void {
  const key = difficulty === '5' ? 'all' : difficulty;
  cache[key] = rows;
}

/** Wait for preload to finish (e.g. before showing quiz). */
export function whenPreloadDone(): Promise<void> {
  return preloadDone ?? Promise.resolve();
}
