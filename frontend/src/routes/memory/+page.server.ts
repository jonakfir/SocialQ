/**
 * Memory game server loader.
 * Priority (each item becomes FacePool entries — emotionId → FacePhoto[]):
 *   1. ?friend=<id>   — fetch that friend's collages (requires friendship);
 *                       personId stamped as the friend's id
 *   2. EkmanImage DB rows (production — has imageUrl from S3/CDN)
 *   3. Local filesystem scan via /api/memory-images (dev without DB)
 *   4. Empty — page falls back to emoji mode
 */
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/db';

const EKMAN_TO_EMOTION: Record<string, string> = {
  Happy:    'happy',
  Anger:    'angry',
  Sad:      'sad',
  Fear:     'fearful',
  Disgust:  'disgusted',
  Surprise: 'surprised',
};

// Friend collages store emotion labels in whatever case the uploader used.
// Normalize to our engine's emotion id vocabulary (emotions.ts).
function normalizeEmotionLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (EKMAN_TO_EMOTION[raw as keyof typeof EKMAN_TO_EMOTION]) {
    return EKMAN_TO_EMOTION[raw as keyof typeof EKMAN_TO_EMOTION];
  }
  // Accept direct emotion ids too (e.g., 'joyful', 'overjoyed' from the web upload flow).
  return lower;
}

export const load: PageServerLoad = async ({ fetch, url }) => {
  const friendParam = url.searchParams.get('friend')?.trim();

  // ── 0. Friend's deck (via ?friend=<id>) ────────────────────
  // Handled via the /api/friends/:friendId/photos route which already enforces
  // friendship. If that succeeds AND has enough emotion coverage we use it.
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
        // Need ≥4 emotions with ≥2 photos so even the smallest modes work.
        const viable = Object.values(pool).filter((a) => a.length >= 2).length;
        if (viable >= 4) {
          const transitionPool = await loadTransitionPool(fetch);
          return { facePool: pool, friendId: friendParam, transitionPool };
        }
      }
    } catch {
      // Fall through to the stock loader if the friend fetch fails.
    }
  }


  // ── 1. Try DB ──────────────────────────────────────────────
  // PERF: only fetch `imageUrl` — NEVER pull the `imageData` base64 column in
  // bulk. Selecting imageData for up to 300 rows was crashing Prisma with
  // "Failed to convert rust String into napi string" (same bug that was
  // hitting admin/photos) and making the /memory page unnavigable, because
  // the server loader would hang/throw and the client's `goto('/memory')`
  // would silently fail.
  //
  // Legacy rows (pre-S3 migration, imageUrl is null) are skipped here.
  // The game's facePool threshold then gates whether face-mode is usable —
  // below the threshold we fall through to the emoji fallback so the lobby
  // still loads.
  try {
    // Prefer SYNTHETIC / Generated Photos rows over stock Ekman. The original
    // Ekman set is a small research dataset (~115 photos across 6 emotions,
    // many in grayscale with hair cut off) — not the portraits the user
    // expects to see in the game. The Generated Photos folder is the
    // admin-curated pool of full-frame color portraits tagged per emotion,
    // which is what Good-with-Faces is built around.
    //
    // Lookup strategy:
    //   1. Try rows whose `folder` starts with "Generated Photos/" (admin
    //      tab's exact filter) OR whose `photoType` is "synthetic".
    //   2. If that set can't meet the ≥4-emotion threshold, fall back to
    //      the stock Ekman set so the game is still playable during dev
    //      where Generated Photos may be empty.
    const generated = await prisma.ekmanImage.findMany({
      where: {
        AND: [
          { imageUrl: { not: null } },
          {
            OR: [
              { folder: { startsWith: 'Generated Photos/' } },
              { photoType: 'synthetic' },
            ],
          },
        ],
      },
      select: { imageUrl: true, label: true },
      take: 500,
    });

    const buildPool = (rows: Array<{ imageUrl: string | null; label: string }>) => {
      const pool: Record<string, string[]> = {};
      for (const row of rows) {
        const emotionId = EKMAN_TO_EMOTION[row.label];
        if (!emotionId || !row.imageUrl) continue;
        if (!pool[emotionId]) pool[emotionId] = [];
        if (pool[emotionId].length < 12) pool[emotionId].push(row.imageUrl);
      }
      return pool;
    };

    let facePool = buildPool(generated);
    const viable = (p: Record<string, string[]>) =>
      Object.values(p).filter((a) => a.length >= 2).length;

    // Fall back to the full Ekman set only if Generated Photos can't cover
    // at least 4 emotions with ≥2 photos each — the minimum for even Easy.
    if (viable(facePool) < 4) {
      console.log(
        `[memory loader] generated photos insufficient (${viable(facePool)} viable emotions); ` +
        `falling back to full Ekman set`
      );
      const stock = await prisma.ekmanImage.findMany({
        where: {
          label: { in: Object.keys(EKMAN_TO_EMOTION) },
          imageUrl: { not: null },
        },
        select: { imageUrl: true, label: true },
        take: 300,
      });
      facePool = buildPool(stock);
    } else {
      console.log(`[memory loader] using generated photos — ${generated.length} rows, ${viable(facePool)} viable emotions`);
    }

    if (viable(facePool) >= 4) {
      const transitionPool = await loadTransitionPool(fetch);
      return { facePool, friendId: null, transitionPool };
    }
  } catch (e) {
    console.error('[memory loader] DB fetch failed:', (e as Error)?.message);
    // DB unavailable / schema mismatch — fall through to local filesystem
  }

  // ── 2. Local filesystem via internal API ───────────────────
  try {
    const res = await fetch('/api/memory-images');
    if (res.ok) {
      const facePool: Record<string, string[]> = await res.json();
      if (Object.keys(facePool).length >= 4) {
        const transitionPool = await loadTransitionPool(fetch);
        return { facePool, friendId: null, transitionPool };
      }
    }
  } catch {}

  // ── 3. Empty fallback (emoji mode) ─────────────────────────
  const transitionPool = await loadTransitionPool(fetch);
  return { facePool: {} as Record<string, string[]>, friendId: null, transitionPool };
};

// Cache transition pool across requests — the clips rarely change.
type TransitionClipDTO = { url: string; fromEmotionId: string; toEmotionId: string };
let transitionCache: TransitionClipDTO[] | null = null;
const EKMAN_LABEL_TO_EMOTION_ID: Record<string, string> = {
  Anger: 'angry', Disgust: 'disgusted', Fear: 'fearful',
  Happy: 'happy', Sad: 'sad', Surprise: 'surprised',
  Neutral: 'happy', // fallback — no tier-1 "neutral" in the wheel
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
