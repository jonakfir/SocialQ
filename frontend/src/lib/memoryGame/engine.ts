// Memory Game Engine — pure TypeScript, zero UI dependencies
// Designed to be VR-portable: all state lives here, renderers are thin shells
//
// Matching modes:
//   'identical'  – both cards show exactly the same emotion (classic memory)
//   'cross-art'  – one card shows emoji, paired card shows cartoon (harder)
//   'category'   – match any Tier-3 emotion that shares a Tier-1 parent

import { type Emotion, emotionsByTier, emotionById } from './emotions';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ArtType = 'emoji' | 'cartoon' | 'face' | 'transition';
// 'face-person' only meaningful when artPack === 'face' — pairs two photos of the
// same PERSON showing DIFFERENT emotions. Clinical "read the emotion" exercise.
//
// Transition match modes (only meaningful when artPack === 'transition'):
//   'transition-chain'    — interpretation B: pair (X→Y, Y→Z). Match when one
//                           clip's end emotion = the other's start emotion.
//   'transition-endpoint' — interpretation C: pair (X→Y, static Y). Match when
//                           the transition's target emotion = the static card's
//                           emotion. Static side uses emoji by default, with
//                           cartoon/face upgrades when available.
export type MatchMode =
  | 'identical'
  | 'cross-art'
  | 'category'
  | 'face-person'
  | 'transition-chain'
  | 'transition-endpoint';
export type GameMode = 'super-easy' | 'easy' | 'medium' | 'hard' | 'expert';
export type GameStatus = 'lobby' | 'playing' | 'checking' | 'animating' | 'won';

export interface CardArt {
  type: ArtType;
  value: string;    // emoji char | image URL | photoId | clipId
  label: string;    // spoken label for audio hint
  emotionId: string;          // for transition cards: the "to" / target emotion
  emotionParentId?: string;   // Tier-1 ancestor, for category matching
  personId?: string;          // owner of a face photo — used by 'face-person' match mode
  fromEmotionId?: string;     // transition cards only: the "from" / start emotion
}

export interface MemoryCard {
  id: string;       // unique per card instance (not per emotion)
  pairKey: string;  // cards with same pairKey are a match
  art: CardArt;
  isFlipped: boolean;
  isMatched: boolean;
}

export interface Player {
  id: 1 | 2;
  name: string;
  matches: number;
  avatar?: string; // URL
}

export interface GameConfig {
  mode: GameMode;
  artPack: ArtType;
  playerCount: 1 | 2;
  matchMode: MatchMode;
  emotionTiers: (1 | 2 | 3)[];
  // Accessibility
  hintsEnabled: boolean;
  audioEnabled: boolean;
  hintDelayMs: number;     // ms before unmatched pair highlights a hint card
  timeLimitMs: number | null; // null = no limit
  // Whether a mismatch costs the current player their turn (and counts
  // against them). Presets flip this off for Super Easy so beginners can
  // keep flipping without punishment; every other level inherits `true`.
  mismatchPenalty: boolean;
  // Multiplayer — when set, deck shuffle is deterministic. Two players sharing
  // a seed + same mode/art/match-mode get the SAME card layout.
  seed?: string;
}

// Face photo: URL plus optional person identity so we can build pairs either
// by emotion (classic memory) or by person (clinical "same person different
// emotions" exercise). Plain URL strings remain accepted for backward compat.
export type FacePhoto = string | { url: string; personId?: string };
export type FacePool = Record<string, FacePhoto[]>;

// Transition clip: an mp4 of a face morphing from one emotion to another.
// Sourced from the existing `/transitions` endpoint.
export interface TransitionClip {
  url: string;
  fromEmotionId: string; // engine emotion id (e.g. 'happy')
  toEmotionId: string;
}
export type TransitionPool = TransitionClip[];

/** Coerce a FacePhoto to its URL regardless of shape. */
function faceURL(p: FacePhoto): string { return typeof p === 'string' ? p : p.url; }
function facePersonId(p: FacePhoto): string | undefined { return typeof p === 'string' ? undefined : p.personId; }

export interface GameState {
  config: GameConfig;
  cards: MemoryCard[];
  cols: number;
  rows: number;
  players: Player[];
  currentPlayerIndex: number;
  flippedIds: string[];    // at most 2 during a turn
  lastMismatchIds: string[]; // briefly held so UI can animate
  status: GameStatus;
  moveCount: number;
  startTime: number;       // Date.now() when game started
  elapsedMs: number;
  hintCardId: string | null;
}

// ─────────────────────────────────────────────────────────────
// Config presets
// ─────────────────────────────────────────────────────────────

interface ModePreset {
  cols: number;
  rows: number;
  tiers: (1|2|3)[];
  hintsEnabled: boolean;
  audioEnabled: boolean;
  hintDelayMs: number;
  timeLimitMs: number | null;
  // Added so the lobby can expose Difficulty + Players only — art pack and
  // match mode are now part of the difficulty itself, not user knobs.
  artPack: ArtType;
  matchMode: MatchMode;
  // Controls whether a mismatch flips the turn to the other player (and in
  // single-player, whether it counts against a score). Super Easy leaves
  // this false so beginners can keep flipping without penalty.
  mismatchPenalty: boolean;
  // Short user-facing descriptor shown under the difficulty button in the
  // lobby. Lets players see what they're picking without any extra config.
  summary: string;
}

// All five difficulties share the same 6×5 board (15 pairs / 30 cards). The
// escalation comes from tier depth, match mode, art pack, hint/time gates,
// and mismatch penalty — mirrors the spec in the product discussion.
export const MODE_PRESETS: Record<GameMode, ModePreset> = {
  'super-easy': {
    cols: 6, rows: 5, tiers: [1],
    hintsEnabled: true,  audioEnabled: true,  hintDelayMs: 3000,
    timeLimitMs: null,
    artPack: 'emoji',        matchMode: 'identical',
    mismatchPenalty: false,
    summary: 'Emoji · tier 1 · hint @ 3s · no time · no penalty',
  },
  'easy': {
    cols: 6, rows: 5, tiers: [1, 2],
    hintsEnabled: true,  audioEnabled: true,  hintDelayMs: 6000,
    timeLimitMs: null,
    artPack: 'cartoon',      matchMode: 'identical',
    mismatchPenalty: true,
    summary: 'Cartoon · tier 1–2 · hint @ 6s · no time',
  },
  'medium': {
    cols: 6, rows: 5, tiers: [1, 2],
    hintsEnabled: true,  audioEnabled: true,  hintDelayMs: 10000,
    timeLimitMs: 240000,
    // Cross-art with cartoon as the primary means the engine picks emoji as
    // the secondary (via pickCrossArtPack), giving an emoji ↔ cartoon deck.
    artPack: 'cartoon',      matchMode: 'cross-art',
    mismatchPenalty: true,
    summary: 'Emoji ↔ Cartoon · tier 1–2 · hint @ 10s · 4:00',
  },
  'hard': {
    cols: 6, rows: 5, tiers: [1, 2, 3],
    hintsEnabled: false, audioEnabled: true,  hintDelayMs: 99_999,
    timeLimitMs: 150000,
    artPack: 'face',         matchMode: 'category',
    mismatchPenalty: true,
    summary: 'Real faces · tier 1–3 · category match · 2:30',
  },
  'expert': {
    cols: 6, rows: 5, tiers: [1, 2, 3],
    hintsEnabled: false, audioEnabled: true,  hintDelayMs: 99_999,
    timeLimitMs: 90000,
    artPack: 'transition',   matchMode: 'transition-chain',
    mismatchPenalty: true,
    summary: 'Transitions · chain endings to starts · tier 1–3 · 1:30',
  },
};

export const MODE_LABELS: Record<GameMode, string> = {
  'super-easy': 'Starter',
  'easy': 'Easy',
  'medium': 'Medium',
  'hard': 'Hard',
  'expert': 'Expert',
};

// ─────────────────────────────────────────────────────────────
// Seeded PRNG (mulberry32) + Fisher-Yates shuffle
// ─────────────────────────────────────────────────────────────
//
// For multiplayer: two players with the same `seed` get the same deck. If no
// seed is provided we fall back to `Math.random` (identical behavior to before).
//
// Exposed as `stringToSeed` + `shuffleSeeded` so the +page can build sharable
// URLs without pulling in a big random library.

/** 32-bit PRNG. Returns a function producing [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash (djb2) so string seeds reproduce across clients. */
export function stringToSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i); // h * 33 xor c
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────
// Card art factory
// ─────────────────────────────────────────────────────────────

// Cartoon art map: emotion id → relative image path.
// Drop PNG/WebP files into /static/memory/cartoons/<emotionId>.png and they're
// picked up automatically. Every emotion in emotions.ts is listed so a partial
// art drop renders as cartoons for covered emotions and falls back to emoji for
// the rest (buildArt handles the fallback on 404 via the <img on:error> handler
// in +page.svelte). All 44 tiers 1–3 are represented.
export const CARTOON_ART: Record<string, string> = {
  // Tier 1 — Core
  happy:      '/memory/cartoons/happy.png',
  sad:        '/memory/cartoons/sad.png',
  angry:      '/memory/cartoons/angry.png',
  fearful:    '/memory/cartoons/fearful.png',
  disgusted:  '/memory/cartoons/disgusted.png',
  surprised:  '/memory/cartoons/surprised.png',
  bad:        '/memory/cartoons/bad.png',
  // Tier 2 — Happy family
  joyful:     '/memory/cartoons/joyful.png',
  content:    '/memory/cartoons/content.png',
  peaceful:   '/memory/cartoons/peaceful.png',
  proud:      '/memory/cartoons/proud.png',
  grateful:   '/memory/cartoons/grateful.png',
  inspired:   '/memory/cartoons/inspired.png',
  // Tier 2 — Sad family
  lonely:     '/memory/cartoons/lonely.png',
  depressed:  '/memory/cartoons/depressed.png',
  hurt:       '/memory/cartoons/hurt.png',
  hopeless:   '/memory/cartoons/hopeless.png',
  // Tier 2 — Angry family
  furious:    '/memory/cartoons/furious.png',
  frustrated: '/memory/cartoons/frustrated.png',
  hostile:    '/memory/cartoons/hostile.png',
  humiliated: '/memory/cartoons/humiliated.png',
  // Tier 2 — Fearful family
  anxious:    '/memory/cartoons/anxious.png',
  overwhelmed:'/memory/cartoons/overwhelmed.png',
  insecure:   '/memory/cartoons/insecure.png',
  // Tier 2 — Disgusted family
  revolted:   '/memory/cartoons/revolted.png',
  judgmental: '/memory/cartoons/judgmental.png',
  // Tier 2 — Surprised family
  amazed:     '/memory/cartoons/amazed.png',
  confused:   '/memory/cartoons/confused.png',
  excited:    '/memory/cartoons/excited.png',
  // Tier 2 — Bad family
  bored:      '/memory/cartoons/bored.png',
  ashamed:    '/memory/cartoons/ashamed.png',
  tired:      '/memory/cartoons/tired.png',
  // Tier 3 — Granular
  overjoyed:  '/memory/cartoons/overjoyed.png',
  delighted:  '/memory/cartoons/delighted.png',
  elated:     '/memory/cartoons/elated.png',
  amused:     '/memory/cartoons/amused.png',
  relieved:   '/memory/cartoons/relieved.png',
  hopeful:    '/memory/cartoons/hopeful.png',
  serene:     '/memory/cartoons/serene.png',
  abandoned:  '/memory/cartoons/abandoned.png',
  isolated:   '/memory/cartoons/isolated.png',
  enraged:    '/memory/cartoons/enraged.png',
  bitter:     '/memory/cartoons/bitter.png',
  annoyed:    '/memory/cartoons/annoyed.png',
  impatient:  '/memory/cartoons/impatient.png',
  worried:    '/memory/cartoons/worried.png',
  terrified:  '/memory/cartoons/terrified.png',
  astonished: '/memory/cartoons/astonished.png',
  awestruck:  '/memory/cartoons/awestruck.png',
};

// Internal: face pool cursor per emotion so each card in a pair gets a different face
const faceCursor: Record<string, number> = {};

// For cross-art mode: if primary is emoji, the secondary card uses cartoon, and vice versa.
// Face / transition packs fall back to emoji since not every emotion has those assets.
function pickCrossArtPack(primary: ArtType): ArtType {
  if (primary === 'emoji') return 'cartoon';
  return 'emoji';
}

// Walk an emotion's parent chain up to its Tier-1 root (happy, sad, angry, …).
// Used by `category` match mode so tier-3 and tier-2 emotions under the same
// tier-1 ancestor are considered a match.
function rootEmotionOf(emotionId: string): string {
  let cur: Emotion | undefined = emotionById[emotionId];
  while (cur?.parent) cur = emotionById[cur.parent];
  return cur?.id ?? emotionId;
}

function buildArt(emotion: Emotion, artPack: ArtType, facePool: FacePool): CardArt {
  let value = emotion.emoji;
  let type: ArtType = artPack;
  let personId: string | undefined;

  if (artPack === 'cartoon') {
    value = CARTOON_ART[emotion.id] ?? emotion.emoji;
    if (!CARTOON_ART[emotion.id]) type = 'emoji'; // fallback
  } else if (artPack === 'face') {
    const faces = facePool[emotion.id];
    if (faces && faces.length >= 2) {
      const idx = faceCursor[emotion.id] ?? 0;
      const photo = faces[idx % faces.length];
      value = faceURL(photo);
      personId = facePersonId(photo);
      faceCursor[emotion.id] = idx + 1;
    } else {
      value = emotion.emoji;
      type = 'emoji';
    }
  }

  return {
    type,
    value,
    label: emotion.label,
    emotionId: emotion.id,
    emotionParentId: emotion.parent,
    personId,
  };
}

/**
 * Face-person pair builder: flatten the face pool into (photo, emotion, person)
 * tuples, group by person, and create pairs where each pair = two photos of the
 * same person ideally showing different emotions. Returns null if the pool is
 * too sparse — caller should then fall back to the classic emotion-pair builder.
 */
function buildFacePersonPairs(
  facePool: FacePool,
  pairCount: number,
  rng: () => number,
): Array<{ a: CardArt; b: CardArt; pairId: string }> | null {
  type Flat = { photo: FacePhoto; emotionId: string; label: string; personId: string };
  const byPerson = new Map<string, Flat[]>();
  for (const [emotionId, photos] of Object.entries(facePool)) {
    const emotion = emotionById[emotionId];
    if (!emotion) continue;
    for (const photo of photos) {
      const pid = facePersonId(photo);
      if (!pid) continue; // person-mode requires identities
      const arr = byPerson.get(pid) ?? [];
      arr.push({ photo, emotionId, label: emotion.label, personId: pid });
      byPerson.set(pid, arr);
    }
  }

  // Build pairs from each person's photos. A person with N photos yields
  // floor(N/2) pairs, preferring pairs with DIFFERENT emotions (the clinical
  // goal). Cross the full pool until we have enough pairs or run out.
  const allPairs: Array<[Flat, Flat]> = [];
  for (const photos of byPerson.values()) {
    if (photos.length < 2) continue;
    const shuffled = shuffle(photos, rng);
    const remaining = [...shuffled];
    while (remaining.length >= 2) {
      const a = remaining.shift()!;
      // Prefer a partner with a DIFFERENT emotion; fall back to any.
      let bIdx = remaining.findIndex((p) => p.emotionId !== a.emotionId);
      if (bIdx === -1) bIdx = 0;
      const b = remaining.splice(bIdx, 1)[0];
      allPairs.push([a, b]);
    }
  }

  if (allPairs.length < pairCount) return null;

  const chosen = shuffle(allPairs, rng).slice(0, pairCount);
  const makeArt = (f: Flat): CardArt => ({
    type: 'face',
    value: faceURL(f.photo),
    label: f.label,
    emotionId: f.emotionId,
    emotionParentId: emotionById[f.emotionId]?.parent,
    personId: f.personId,
  });
  return chosen.map(([a, b], i) => ({ a: makeArt(a), b: makeArt(b), pairId: `person-${i}` }));
}

/** Build a transition-clip CardArt from a clip, with a human-readable label. */
function transitionArtFromClip(clip: TransitionClip): CardArt {
  const fromLabel = emotionById[clip.fromEmotionId]?.label ?? clip.fromEmotionId;
  const toLabel = emotionById[clip.toEmotionId]?.label ?? clip.toEmotionId;
  return {
    type: 'transition',
    value: clip.url,
    label: `${fromLabel} → ${toLabel}`,
    emotionId: clip.toEmotionId,
    emotionParentId: emotionById[clip.toEmotionId]?.parent,
    fromEmotionId: clip.fromEmotionId,
  };
}

/**
 * Interpretation B pair builder: pair (X→Y, Y→Z) so that one clip's end matches
 * the other's start. Returns null if the pool is too sparse to form pairCount
 * distinct chained pairs.
 *
 * Greedy algorithm: shuffle the pool, then for each unused clip find another
 * unused clip whose `from` matches this one's `to`. Prefer partners whose `to`
 * differs from this one's `from` so we don't accidentally build X→Y→X loops.
 */
function buildTransitionChainPairs(
  pool: TransitionPool,
  pairCount: number,
  rng: () => number,
): Array<{ a: TransitionClip; b: TransitionClip; pairId: string }> | null {
  if (pool.length < pairCount * 2) return null;

  const shuffled = shuffle(pool, rng);
  const used = new Set<TransitionClip>();
  const pairs: Array<{ a: TransitionClip; b: TransitionClip; pairId: string }> = [];

  for (const first of shuffled) {
    if (used.has(first)) continue;
    const candidates = shuffled.filter(
      (c) => !used.has(c) && c !== first && c.fromEmotionId === first.toEmotionId,
    );
    if (candidates.length === 0) continue;
    // Prefer a candidate whose `to` differs from first.from (avoid X→Y→X loops).
    let second = candidates.find((c) => c.toEmotionId !== first.fromEmotionId);
    if (!second) second = candidates[0];
    used.add(first);
    used.add(second);
    pairs.push({ a: first, b: second, pairId: `chain-${pairs.length}` });
    if (pairs.length >= pairCount) break;
  }

  return pairs.length >= pairCount ? pairs : null;
}

/**
 * Interpretation C pair builder: each pair = (transition clip X→Y, static card
 * showing Y). The static side upgrades from emoji → cartoon → face when
 * better art is available for that emotion. Returns null if there aren't
 * enough clips with distinct target emotions.
 *
 * We insist on distinct target emotions across pairs so the deck isn't
 * embarrassingly easy (two static cards both showing "Happy" would both match
 * any clip ending in happy).
 */
function buildTransitionEndpointPairs(
  pool: TransitionPool,
  pairCount: number,
  rng: () => number,
  preferredStaticArt: ArtType,
  facePool: FacePool,
): Array<{ a: CardArt; b: CardArt; pairId: string }> | null {
  const shuffled = shuffle(pool, rng);
  const seenTargets = new Set<string>();
  const pairs: Array<{ a: CardArt; b: CardArt; pairId: string }> = [];

  for (const clip of shuffled) {
    if (seenTargets.has(clip.toEmotionId)) continue;
    const target = emotionById[clip.toEmotionId];
    if (!target) continue;

    // Static partner: prefer cartoon when the user asked for it AND art exists,
    // then face when a photo is available, else fall back to emoji. Emoji
    // always works so endpoint mode can never starve for static partners.
    let staticArt: CardArt;
    if (preferredStaticArt === 'cartoon' && CARTOON_ART[target.id]) {
      staticArt = {
        type: 'cartoon',
        value: CARTOON_ART[target.id],
        label: target.label,
        emotionId: target.id,
        emotionParentId: target.parent,
      };
    } else if (preferredStaticArt === 'face' && (facePool[target.id]?.length ?? 0) > 0) {
      const photo = facePool[target.id][0];
      staticArt = {
        type: 'face',
        value: faceURL(photo),
        label: target.label,
        emotionId: target.id,
        emotionParentId: target.parent,
        personId: facePersonId(photo),
      };
    } else {
      staticArt = {
        type: 'emoji',
        value: target.emoji,
        label: target.label,
        emotionId: target.id,
        emotionParentId: target.parent,
      };
    }

    seenTargets.add(clip.toEmotionId);
    pairs.push({
      a: transitionArtFromClip(clip),
      b: staticArt,
      pairId: `endpoint-${pairs.length}`,
    });
    if (pairs.length >= pairCount) break;
  }

  return pairs.length >= pairCount ? pairs : null;
}

// ─────────────────────────────────────────────────────────────
// createGame
// ─────────────────────────────────────────────────────────────

export function createGame(
  partial: Partial<GameConfig> = {},
  facePool: FacePool = {},
  transitionPool: TransitionPool = [],
): GameState {
  const mode: GameMode = partial.mode ?? 'easy';
  const preset = MODE_PRESETS[mode];

  // Preset-driven config: art pack, match mode, tiers, hints, audio, time
  // limit, and mismatch penalty all come from MODE_PRESETS. Callers (the
  // lobby UI) only need to pick a difficulty + player count. Test and admin
  // paths can still override any field via `partial` — that's why we keep
  // the `partial.X ?? preset.X` fallback pattern instead of hard-locking
  // everything to the preset.
  const config: GameConfig = {
    mode,
    artPack: partial.artPack ?? preset.artPack,
    playerCount: partial.playerCount ?? 1,
    matchMode: partial.matchMode ?? preset.matchMode,
    emotionTiers: partial.emotionTiers ?? preset.tiers,
    hintsEnabled: partial.hintsEnabled ?? preset.hintsEnabled,
    audioEnabled: partial.audioEnabled ?? preset.audioEnabled,
    hintDelayMs: partial.hintDelayMs ?? preset.hintDelayMs,
    timeLimitMs: partial.timeLimitMs ?? preset.timeLimitMs,
    mismatchPenalty: partial.mismatchPenalty ?? preset.mismatchPenalty,
    seed: partial.seed,
  };

  // If a seed is provided, build a seeded PRNG so the two shuffle calls below
  // are deterministic. Otherwise fall back to Math.random.
  const rng = config.seed != null ? mulberry32(stringToSeed(config.seed)) : Math.random;

  // Validate inputs — misconfigurations fail fast instead of silently producing a
  // broken deck. Mode presets themselves are static so they're trusted.
  if (!Array.isArray(config.emotionTiers) || config.emotionTiers.length === 0) {
    throw new Error('[memoryGame] emotionTiers must be a non-empty array');
  }
  if (!config.emotionTiers.every((t) => t === 1 || t === 2 || t === 3)) {
    throw new Error('[memoryGame] emotionTiers values must be 1, 2, or 3');
  }

  const { cols, rows } = preset;
  if (((cols * rows) % 2) !== 0) {
    throw new Error(`[memoryGame] ${mode} grid ${cols}×${rows} has an odd card count; a memory game requires pairs`);
  }
  const pairCount = (cols * rows) / 2;

  // Reset face cursors for a fresh game
  for (const key of Object.keys(faceCursor)) delete faceCursor[key];

  const cards: MemoryCard[] = [];

  // ── Transition clips — three interpretations, selected by matchMode ──
  //   A: identical / cross-art / category → two copies of the same clip play on
  //      both cards; matching reduces to the classic pairKey check.
  //   B: 'transition-chain' → pair (X→Y, Y→Z); match when one clip's end =
  //      the other's start. Builds emotional-arc stories.
  //   C: 'transition-endpoint' → pair (X→Y clip, static card of Y); match when
  //      the clip's target equals the static emotion. Teaches "where does this
  //      emotion end up".
  // Each B/C builder returns null if the pool can't support enough pairs; we
  // then fall back to interpretation A so the deck is always playable.
  if (config.artPack === 'transition' && transitionPool.length > 0) {
    let built = false;

    if (config.matchMode === 'transition-chain') {
      const chainPairs = buildTransitionChainPairs(transitionPool, pairCount, rng);
      if (chainPairs) {
        chainPairs.forEach(({ a, b, pairId }) => {
          cards.push({ id: `${pairId}-0`, pairKey: pairId, art: transitionArtFromClip(a), isFlipped: false, isMatched: false });
          cards.push({ id: `${pairId}-1`, pairKey: pairId, art: transitionArtFromClip(b), isFlipped: false, isMatched: false });
        });
        built = true;
      }
    } else if (config.matchMode === 'transition-endpoint') {
      // Use emoji as the static side by default. Upgrade to cartoon/face if the
      // user's chosen art pack implies it — but note the *art pack itself* is
      // `transition`, so we look at a soft preference hint stored on config via
      // a convention: when the main artPack is 'transition', callers can nudge
      // the static side by populating facePool / cartoon art. The builder
      // prefers face when present, then cartoon when present, then emoji.
      const preferred: ArtType = Object.keys(facePool).length > 0 ? 'face' : 'cartoon';
      const endpointPairs = buildTransitionEndpointPairs(
        transitionPool,
        pairCount,
        rng,
        preferred,
        facePool,
      );
      if (endpointPairs) {
        endpointPairs.forEach(({ a, b, pairId }) => {
          cards.push({ id: `${pairId}-0`, pairKey: pairId, art: a, isFlipped: false, isMatched: false });
          cards.push({ id: `${pairId}-1`, pairKey: pairId, art: b, isFlipped: false, isMatched: false });
        });
        built = true;
      }
    }

    // Fallback / default: interpretation A — both cards show the same clip.
    if (!built) {
      const clips = shuffle(transitionPool, rng).slice(0, pairCount);
      if (clips.length >= pairCount) {
        clips.forEach((clip, i) => {
          const pairKey = `clip-${i}`;
          const art = transitionArtFromClip(clip);
          cards.push({ id: `${pairKey}-0`, pairKey, art: { ...art }, isFlipped: false, isMatched: false });
          cards.push({ id: `${pairKey}-1`, pairKey, art: { ...art }, isFlipped: false, isMatched: false });
        });
      }
    }
  }

  // ── Face-person match mode — pairs by person (clinical mode) ──
  // Each pair is two photos of the same person, preferably showing different
  // emotions. Requires a FacePool with personId tags; falls back to the classic
  // emotion-pair flow otherwise so the game never hard-fails.
  if (config.matchMode === 'face-person' && config.artPack === 'face') {
    const personPairs = buildFacePersonPairs(facePool, pairCount, rng);
    if (personPairs) {
      personPairs.forEach(({ a, b, pairId }) => {
        cards.push({ id: `${pairId}-0`, pairKey: pairId, art: a, isFlipped: false, isMatched: false });
        cards.push({ id: `${pairId}-1`, pairKey: pairId, art: b, isFlipped: false, isMatched: false });
      });
    }
  }

  if (cards.length === 0) {
    // ── Classic emotion-pair builder ──
    let pool = shuffle(emotionsByTier(config.emotionTiers), rng);

    // For `face` art: every card must actually render as a face. Previously
    // the engine happily picked emotions the pool couldn't cover (e.g.
    // "lonely", "proud", "content") and buildArt silently fell back to
    // emoji — which looked like a bug to anyone who picked "Real Faces"
    // and saw half their cards as emoji.
    // Fix: restrict the emotion pool to face-eligible emotions (≥ 2 photos
    // in facePool).
    if (config.artPack === 'face') {
      const eligible = pool.filter((e) => (facePool[e.id]?.length ?? 0) >= 2);
      // Restrict pool to face-eligible emotions whenever the mode tolerates
      // repeats. Identical / face-person do so natively (emotion-id /
      // person-id matching). Category matches by Tier-1 ancestor, so
      // repeats of the same family are a valid match — so it's also safe
      // to restrict + repeat here. Only cross-art is left out: two pairs
      // of the same emotion would create ambiguous emoji↔cartoon matches.
      const canRepeat = config.matchMode === 'identical' || config.matchMode === 'face-person' || config.matchMode === 'category';
      if (eligible.length > 0 && (eligible.length >= pairCount || canRepeat)) {
        pool = eligible;
      }
      // else (cross-art + short face pool): keep the broader tier pool and
      // let buildArt emoji-fallback fill the shortfall.
    }

    // Whenever the tier pool is smaller than pairCount, repeat emotions to
    // fill the deck. Identical / face-person match modes handle repeats
    // natively (identical = emotion-id match, face-person = per-pair
    // personId). Other match modes may produce semantically odd decks with
    // repeats (e.g. in category mode multiple pairs may belong to the same
    // family), but the deck is always playable — preferable to throwing.
    // This path is also the classic-fallback safety net for transition art
    // when the clip pool is too sparse.
    if (pool.length > 0 && pool.length < pairCount) {
      const repeated: Emotion[] = [];
      for (let i = 0; i < pairCount; i++) repeated.push(pool[i % pool.length]);
      pool = shuffle(repeated, rng);
    }

    if (pool.length < pairCount) {
      throw new Error(
        `[memoryGame] ${mode} needs ${pairCount} emotions but tier(s) [${config.emotionTiers.join(',')}] only provide ${pool.length}`,
      );
    }
    const chosen = pool.slice(0, pairCount);

    // Build card pairs — each emotion generates 2 cards (different faces if artPack=face)
    // For cross-art mode, the two copies intentionally use DIFFERENT art types so that
    // `isMatch('cross-art')` (which requires a.art.type !== b.art.type) can succeed.
    chosen.forEach((emotion, i) => {
      const pairKey = `pair-${i}`;
      for (let copy = 0; copy < 2; copy++) {
        const artPack = config.matchMode === 'cross-art' && copy === 1
          ? pickCrossArtPack(config.artPack)
          : config.artPack;
        cards.push({
          id: `${pairKey}-${copy}`,
          pairKey,
          art: buildArt(emotion, artPack, facePool),
          isFlipped: false,
          isMatched: false,
        });
      }
    });
  }

  const players: Player[] = [
    { id: 1, name: 'Player 1', matches: 0 },
    ...(config.playerCount === 2 ? [{ id: 2 as const, name: 'Player 2', matches: 0 }] : []),
  ];

  return {
    config,
    cards: shuffle(cards, rng),
    cols,
    rows,
    players,
    currentPlayerIndex: 0,
    flippedIds: [],
    lastMismatchIds: [],
    status: 'playing',
    moveCount: 0,
    startTime: Date.now(),
    elapsedMs: 0,
    hintCardId: null,
  };
}

// ─────────────────────────────────────────────────────────────
// flipCard — called when a player taps a card
// Returns new state; caller should schedule checkMatch after
// a short delay if flippedIds.length === 2
// ─────────────────────────────────────────────────────────────

export function flipCard(state: GameState, cardId: string): GameState {
  if (state.status !== 'playing') return state;
  if (state.flippedIds.length >= 2) return state;

  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.isFlipped || card.isMatched) return state;

  const flippedIds = [...state.flippedIds, cardId];
  const cards = state.cards.map(c =>
    c.id === cardId ? { ...c, isFlipped: true } : c
  );

  return {
    ...state,
    cards,
    flippedIds,
    lastMismatchIds: [],
    hintCardId: null,
    status: flippedIds.length === 2 ? 'checking' : 'playing',
  };
}

// ─────────────────────────────────────────────────────────────
// checkMatch — call after both cards are flipped
// ─────────────────────────────────────────────────────────────

export function checkMatch(state: GameState): GameState {
  if (state.status !== 'checking') return state;
  if (state.flippedIds.length !== 2) return state;

  const [idA, idB] = state.flippedIds;
  const cardA = state.cards.find(c => c.id === idA);
  const cardB = state.cards.find(c => c.id === idB);
  if (!cardA || !cardB) return state; // defensive: IDs in flippedIds should always exist

  const matched = isMatch(cardA, cardB, state.config.matchMode);
  const moveCount = state.moveCount + 1;

  if (matched) {
    const cards = state.cards.map(c =>
      c.id === idA || c.id === idB ? { ...c, isMatched: true, isFlipped: true } : c
    );
    const players = state.players.map((p, i) =>
      i === state.currentPlayerIndex ? { ...p, matches: p.matches + 1 } : p
    );
    const won = cards.every(c => c.isMatched);
    return {
      ...state,
      cards,
      players,
      flippedIds: [],
      lastMismatchIds: [],
      moveCount,
      status: won ? 'won' : 'playing',
      // On a match the SAME player goes again (classic memory rules)
    };
  } else {
    // Mismatch — flip cards back. Whether to rotate the turn depends on
    // `mismatchPenalty`:
    //   - true (default / Easy+): classic memory rules; the other player
    //     goes next, and in single-player the moveCount grows against you.
    //   - false (Super Easy): same player keeps flipping. No punishment for
    //     mistakes, good for kids and first-timers.
    const nextPlayerIndex = state.config.mismatchPenalty
      ? (state.currentPlayerIndex + 1) % state.players.length
      : state.currentPlayerIndex;
    return {
      ...state,
      flippedIds: [],
      lastMismatchIds: [idA, idB],
      moveCount,
      status: 'animating', // caller animates flip-back, then sets 'playing'
      currentPlayerIndex: nextPlayerIndex,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// resolveAnimation — call after mismatch flip-back animation ends
// ─────────────────────────────────────────────────────────────

export function resolveAnimation(state: GameState): GameState {
  if (state.status !== 'animating') return state;
  const cards = state.cards.map(c =>
    state.lastMismatchIds.includes(c.id) ? { ...c, isFlipped: false } : c
  );
  return { ...state, cards, lastMismatchIds: [], status: 'playing' };
}

// ─────────────────────────────────────────────────────────────
// useHint — reveal a hint card for super-easy / easy modes
// ─────────────────────────────────────────────────────────────

export function useHint(state: GameState): GameState {
  if (!state.config.hintsEnabled) return state;
  if (state.flippedIds.length !== 1) return state;

  const [flippedId] = state.flippedIds;
  const flipped = state.cards.find(c => c.id === flippedId);
  if (!flipped) return state;

  // Find the partner card (same pairKey, not already flipped)
  const partner = state.cards.find(
    c => c.pairKey === flipped.pairKey && c.id !== flippedId && !c.isMatched
  );
  if (!partner) return state;

  return { ...state, hintCardId: partner.id };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isMatch(a: MemoryCard, b: MemoryCard, mode: MatchMode): boolean {
  switch (mode) {
    case 'identical':
      // Match on emotion id, not pair-key. With presets allowing emotion
      // repeats when the tier pool is smaller than pairCount (e.g. Super
      // Easy on tier 1 has 7 emotions covering 15 pairs), two cards
      // showing the same emotion are always a valid match — regardless of
      // whether they share a pair-key or happen to come from different
      // repeated pair slots. This matches user expectation: "any two
      // Happys match, any two Sads match, etc."
      //
      // When the pool is bigger than pairCount (Hard / Expert tiers cover
      // the full board), emotion id and pair-key are equivalent keys —
      // each emotion appears in exactly one pair — so this also preserves
      // the classic behavior on those difficulties.
      return a.art.emotionId === b.art.emotionId;
    case 'cross-art':
      return a.art.emotionId === b.art.emotionId && a.art.type !== b.art.type;
    case 'category':
      // Match if cards share the same Tier-1 ancestor (walk the parent chain).
      return rootEmotionOf(a.art.emotionId) === rootEmotionOf(b.art.emotionId);
    case 'face-person':
      // Two face photos of the same person (usually different emotions).
      // pairKey equality is the canonical check — built that way in createGame.
      return a.pairKey === b.pairKey && !!a.art.personId && a.art.personId === b.art.personId;
    case 'transition-chain': {
      // Two transition clips where one's end emotion = the other's start.
      // Symmetric so flip order doesn't matter.
      if (a.art.type !== 'transition' || b.art.type !== 'transition') return false;
      const aFrom = a.art.fromEmotionId, aTo = a.art.emotionId;
      const bFrom = b.art.fromEmotionId, bTo = b.art.emotionId;
      if (!aFrom || !bFrom) return false;
      return aTo === bFrom || bTo === aFrom;
    }
    case 'transition-endpoint': {
      // One transition card, one static card; transition's `to` = static's emotion.
      const aT = a.art.type === 'transition';
      const bT = b.art.type === 'transition';
      if (aT === bT) return false; // both transitions OR both static → not an endpoint pair
      if (aT) return a.art.emotionId === b.art.emotionId;
      return b.art.emotionId === a.art.emotionId;
    }
  }
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function winner(state: GameState): Player | null {
  if (state.status !== 'won') return null;
  return state.players.reduce((best, p) => (p.matches > best.matches ? p : best));
}

export function isTie(state: GameState): boolean {
  if (state.status !== 'won' || state.players.length < 2) return false;
  return state.players[0].matches === state.players[1].matches;
}

export function totalPairs(state: GameState): number {
  return state.cards.length / 2;
}

export function matchedPairs(state: GameState): number {
  return state.cards.filter(c => c.isMatched).length / 2;
}
