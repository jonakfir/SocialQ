/**
 * Memory game server loader — kept intentionally tiny.
 *
 * Previously this loader blocked on a 500-row RDS query (Generated Photos)
 * which made the Dashboard → Good with Faces transition feel broken (1–3s).
 * The DB work has moved to a client-side fetch of /api/memory-face-pool,
 * which this page's +page.svelte fires onMount after the lobby renders.
 *
 * Friend decks are still resolved here (they're fast — a single authorized
 * API call) so invited-friend seeds land on the right pool before the lobby
 * auto-starts from URL params.
 *
 * Transitions are also returned here because the clip list is tiny and
 * already cached in-module.
 */
import type { PageServerLoad } from './$types';

const EKMAN_TO_EMOTION: Record<string, string> = {
  Happy:    'happy',
  Anger:    'angry',
  Sad:      'sad',
  Fear:     'fearful',
  Disgust:  'disgusted',
  Surprise: 'surprised',
};

function normalizeEmotionLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (EKMAN_TO_EMOTION[raw as keyof typeof EKMAN_TO_EMOTION]) {
    return EKMAN_TO_EMOTION[raw as keyof typeof EKMAN_TO_EMOTION];
  }
  return lower;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const friendParam = url.searchParams.get('friend')?.trim();

  // ── Friend deck (cheap, always resolved server-side) ───────
  if (friendParam) {
    try {
      const res = await fetch(`/api/friends/${encodeURIComponent(friendParam)}/photos`);
      if (res.ok) {
        const body = await res.json();
        type FacePhoto = { url: string; personId?: string };
        const pool: Record<string, FacePhoto[]> = {};
        for (const c of body?.collages ?? []) {
          const emotions: string[] = Array.isArray(c?.emotions) ? c.emotions : [];
          if (!c?.imageUrl || emotions.length === 0) continue;
          for (const raw of emotions) {
            const eid = normalizeEmotionLabel(raw);
            if (!eid) continue;
            (pool[eid] ??= []).push({ url: c.imageUrl, personId: friendParam });
          }
        }
        const viable = Object.values(pool).filter((a) => a.length >= 2).length;
        if (viable >= 4) {
          return { facePool: pool, friendId: friendParam, transitionPool: await loadTransitionPool(fetch) };
        }
      }
    } catch {
      /* fall through */
    }
  }

  // ── Stock path ─────────────────────────────────────────────
  // Empty pool up front — the client fetches /api/memory-face-pool onMount
  // and merges it into the page data. Lobby renders instantly either way;
  // face-mode games just wait for the pool to arrive (usually <1s).
  return {
    facePool: {} as Record<string, string[]>,
    friendId: null,
    transitionPool: await loadTransitionPool(fetch),
  };
};

// Transition clips are a short list; cache in-module so repeat loads skip
// the fetch. Kept here because the loader still wants a transitionPool on
// the returned data shape and transitions are used client-side immediately.
type TransitionClipDTO = { url: string; fromEmotionId: string; toEmotionId: string };
let transitionCache: TransitionClipDTO[] | null = null;
const EKMAN_LABEL_TO_EMOTION_ID: Record<string, string> = {
  Anger: 'angry', Disgust: 'disgusted', Fear: 'fearful',
  Happy: 'happy', Sad: 'sad', Surprise: 'surprised',
  Neutral: 'happy',
};

async function loadTransitionPool(fetch: typeof globalThis.fetch): Promise<TransitionClipDTO[]> {
  if (transitionCache) return transitionCache;
  try {
    const res = await fetch('/transitions');
    if (!res.ok) return [];
    const rows: Array<{ href: string; from: string; to: string }> = await res.json();
    const mapped = rows
      .map((r) => ({
        url: r.href,
        fromEmotionId: EKMAN_LABEL_TO_EMOTION_ID[r.from] ?? r.from.toLowerCase(),
        toEmotionId:   EKMAN_LABEL_TO_EMOTION_ID[r.to]   ?? r.to.toLowerCase(),
      }))
      .filter((c) => c.url && c.fromEmotionId && c.toEmotionId);
    transitionCache = mapped;
    return mapped;
  } catch {
    return [];
  }
}
