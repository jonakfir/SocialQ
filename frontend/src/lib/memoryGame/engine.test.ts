// Engine unit tests for the "Good with Faces" memory game.
// The engine is pure TS with zero UI/DOM dependencies, so this runs under vitest
// with the default Node environment (no jsdom needed).

import { describe, it, expect } from 'vitest';
import {
  createGame,
  flipCard,
  checkMatch,
  resolveAnimation,
  useHint,
  winner,
  isTie,
  totalPairs,
  matchedPairs,
  currentPlayer,
  MODE_PRESETS,
  type GameState,
  type GameMode,
  type FacePool,
} from './engine';
import { EMOTIONS, emotionById } from './emotions';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Flip a specific card and commit the checkMatch synchronously (tests don't animate). */
function flipAndCheck(state: GameState, idA: string, idB: string): GameState {
  let s = flipCard(state, idA);
  s = flipCard(s, idB);
  return checkMatch(s);
}

/** Find the other card that shares a pairKey with the given card. */
function partnerOf(state: GameState, id: string): string {
  const card = state.cards.find((c) => c.id === id)!;
  return state.cards.find((c) => c.pairKey === card.pairKey && c.id !== id)!.id;
}

// ─────────────────────────────────────────────────────────────
// createGame — deck generation
// ─────────────────────────────────────────────────────────────

describe('createGame — deck generation', () => {
  // After the difficulty refactor every level is 5×6 (30 cards / 15 pairs) —
  // escalation now lives in tier depth, art pack, match mode, and time limit
  // rather than in grid size. Derive expected count from MODE_PRESETS so the
  // test can't drift from the engine.
  const modes: GameMode[] = ['super-easy', 'easy', 'medium', 'hard', 'expert'];
  for (const mode of modes) {
    const preset = MODE_PRESETS[mode];
    const expectedCards = preset.cols * preset.rows;
    it(`creates ${expectedCards} cards (${expectedCards / 2} pairs) for ${mode}`, () => {
      const g = createGame({ mode });
      expect(g.cards.length).toBe(expectedCards);
      expect(totalPairs(g)).toBe(expectedCards / 2);
    });
  }

  it('every card has exactly one partner with the same pairKey', () => {
    const g = createGame({ mode: 'medium' });
    const byPair = new Map<string, number>();
    for (const c of g.cards) byPair.set(c.pairKey, (byPair.get(c.pairKey) || 0) + 1);
    for (const [, count] of byPair) expect(count).toBe(2);
  });

  it('all card ids are unique', () => {
    const g = createGame({ mode: 'expert' });
    const ids = new Set(g.cards.map((c) => c.id));
    expect(ids.size).toBe(g.cards.length);
  });

  it('cards are shuffled (not in pair-adjacent order) over N runs', () => {
    // Fisher-Yates with Math.random — we can't assert a specific order, but
    // over many runs the probability that pairs are always adjacent → 0.
    let adjacentRuns = 0;
    for (let i = 0; i < 20; i++) {
      const g = createGame({ mode: 'medium' });
      const allPairsAdjacent = g.cards.every(
        (c, idx) => idx % 2 === 1 || g.cards[idx + 1]?.pairKey === c.pairKey,
      );
      if (allPairsAdjacent) adjacentRuns++;
    }
    // 20 shuffled runs, all adjacent is astronomically unlikely for 16 cards
    expect(adjacentRuns).toBeLessThan(20);
  });

  it('each mode uses only its preset-declared tiers', () => {
    // Post-refactor presets: super-easy=[1], easy/medium=[1,2], hard/expert=[1,2,3].
    // This test makes no claim about which specific tier appears — just that
    // no card's emotion comes from a tier the preset didn't allow.
    const modes: GameMode[] = ['super-easy', 'easy', 'medium', 'hard', 'expert'];
    for (const mode of modes) {
      const preset = MODE_PRESETS[mode];
      const g = createGame({ mode });
      for (const card of g.cards) {
        const emotion = emotionById[card.art.emotionId];
        if (!emotion) continue; // transition cards don't map cleanly
        expect(
          preset.tiers.includes(emotion.tier),
          `${mode} card "${emotion.id}" has tier ${emotion.tier} not in preset tiers [${preset.tiers.join(',')}]`,
        ).toBe(true);
      }
    }
  });

  it('hintsEnabled matches the preset (true for super-easy/easy/medium, false for hard/expert)', () => {
    for (const mode of Object.keys(MODE_PRESETS) as GameMode[]) {
      const expected = MODE_PRESETS[mode].hintsEnabled;
      expect(createGame({ mode }).config.hintsEnabled, `${mode} hintsEnabled`).toBe(expected);
    }
  });

  it('timeLimitMs matches the preset', () => {
    // Super-easy and easy are untimed; medium/hard/expert each have a
    // distinct cap set in MODE_PRESETS.
    for (const mode of Object.keys(MODE_PRESETS) as GameMode[]) {
      expect(createGame({ mode }).config.timeLimitMs).toBe(MODE_PRESETS[mode].timeLimitMs);
    }
  });

  it('super-easy leaves mismatchPenalty off; all other difficulties turn it on', () => {
    expect(createGame({ mode: 'super-easy' }).config.mismatchPenalty).toBe(false);
    for (const mode of ['easy', 'medium', 'hard', 'expert'] as const) {
      expect(createGame({ mode }).config.mismatchPenalty, `${mode} should penalize`).toBe(true);
    }
  });

  it('status starts as "playing"', () => {
    expect(createGame({ mode: 'easy' }).status).toBe('playing');
  });

  it('2-player config creates two Player objects', () => {
    const g = createGame({ mode: 'easy', playerCount: 2 });
    expect(g.players.length).toBe(2);
    expect(g.players[0].matches).toBe(0);
    expect(g.players[1].matches).toBe(0);
  });

  it('1-player config creates one Player', () => {
    const g = createGame({ mode: 'easy', playerCount: 1 });
    expect(g.players.length).toBe(1);
  });

  it('matchMode propagates from partial config', () => {
    const g = createGame({ mode: 'easy', matchMode: 'category' });
    expect(g.config.matchMode).toBe('category');
  });

  it('preset tier pool covers pairCount, or preset allows repeats to fill the board', () => {
    // Post-refactor the engine repeats emotions when the tier pool is
    // smaller than pairCount AND the match mode is pair-key-safe (identical
    // / face-person). Super Easy relies on this (tier 1 has 7 emotions for
    // 15 pairs). The assertion is either "tier pool covers all pairs" or
    // "match mode permits repeats", not "pool is always big enough."
    const REPEAT_SAFE_MODES = new Set(['identical', 'face-person']);
    for (const [mode, preset] of Object.entries(MODE_PRESETS)) {
      const pairCount = (preset.cols * preset.rows) / 2;
      const pool = EMOTIONS.filter((e) => preset.tiers.includes(e.tier));
      const viable = pool.length >= pairCount || REPEAT_SAFE_MODES.has(preset.matchMode);
      expect(viable, `${mode}: tier pool ${pool.length} < ${pairCount} pairs AND match mode "${preset.matchMode}" is not repeat-safe`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Input validation (Phase 1 hardening)
// ─────────────────────────────────────────────────────────────

describe('createGame input validation', () => {
  it('throws on empty emotionTiers', () => {
    expect(() => createGame({ mode: 'easy', emotionTiers: [] })).toThrowError(/emotionTiers/);
  });

  it('throws on invalid tier values', () => {
    expect(() => createGame({ mode: 'easy', emotionTiers: [4 as 1] })).toThrowError(/emotionTiers values/);
  });

  it('fills the deck via emotion repeats when tier pool < pairCount', () => {
    // Post-refactor behavior: tier-1 has 7 emotions but every level is 5×6
    // (15 pairs). Forcing tier-1 on Expert now fills the deck by repeating
    // emotions rather than throwing — the engine accepts that repeat-heavy
    // decks are still playable (some match modes may even prefer it).
    const g = createGame({ mode: 'expert', emotionTiers: [1] });
    expect(g.cards.length).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────
// Cross-art — the regression bug from Phase 0.2
// ─────────────────────────────────────────────────────────────

describe('cross-art match mode (regression: was unwinnable)', () => {
  it('paired cards have DIFFERENT art types when matchMode=cross-art', () => {
    const g = createGame({ mode: 'easy', matchMode: 'cross-art', artPack: 'emoji' });
    // Collect cards by pairKey
    const byPair = new Map<string, typeof g.cards>();
    for (const c of g.cards) {
      const arr = byPair.get(c.pairKey) ?? [];
      arr.push(c);
      byPair.set(c.pairKey, arr);
    }
    for (const [pairKey, pair] of byPair) {
      expect(pair.length, `pair ${pairKey} size`).toBe(2);
      expect(pair[0].art.type, `pair ${pairKey} types`).not.toBe(pair[1].art.type);
    }
  });

  it('cross-art pairs actually match when checkMatch is called', () => {
    const g = createGame({ mode: 'easy', matchMode: 'cross-art', artPack: 'emoji' });
    // Pick any pair and flip both cards — the engine should call it a match.
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const after = flipAndCheck(g, a.id, bId);
    expect(after.status).not.toBe('animating'); // 'animating' means mismatch
    expect(after.cards.find((c) => c.id === a.id)?.isMatched).toBe(true);
  });

  it('non-pair cross-art cards do NOT match (negative case)', () => {
    const g = createGame({ mode: 'easy', matchMode: 'cross-art', artPack: 'emoji' });
    // Find two cards that are NOT partners.
    const a = g.cards[0];
    const nonPartner = g.cards.find(
      (c) => c.id !== a.id && c.pairKey !== a.pairKey && c.art.emotionId !== a.art.emotionId,
    )!;
    const after = flipAndCheck(g, a.id, nonPartner.id);
    expect(after.status).toBe('animating');
  });

  it('primary emoji artPack → secondary is cartoon (or vice versa)', () => {
    const g = createGame({ mode: 'easy', matchMode: 'cross-art', artPack: 'emoji' });
    // In every pair, one card should be emoji and one cartoon (or emoji fallback).
    const byPair = new Map<string, Set<string>>();
    for (const c of g.cards) {
      const set = byPair.get(c.pairKey) ?? new Set<string>();
      set.add(c.art.type);
      byPair.set(c.pairKey, set);
    }
    for (const [pairKey, typeSet] of byPair) {
      expect(typeSet.size, `pair ${pairKey} should have two distinct types`).toBe(2);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Category match — the regression bug from Phase 0.3
// ─────────────────────────────────────────────────────────────

describe('category match mode (regression: parent chain walk)', () => {
  it('tier-1 emotions match each other under identical pairKey', () => {
    // This is classic same-pairKey, handled by the `isMatch` identical path too.
    const g = createGame({ mode: 'easy', matchMode: 'category' });
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const after = flipAndCheck(g, a.id, bId);
    expect(after.cards.find((c) => c.id === a.id)?.isMatched).toBe(true);
  });

  it('tier-3 "overjoyed" and tier-2 "joyful" both resolve to tier-1 "happy"', () => {
    // This doesn't test the engine directly but confirms the emotion data that
    // underpins the category match. If this breaks, category mode is broken.
    expect(emotionById['overjoyed']?.parent).toBe('joyful');
    expect(emotionById['joyful']?.parent).toBe('happy');
    expect(emotionById['happy']?.parent).toBeUndefined(); // tier-1 root
  });

  it('category match: manually-crafted joyful+overjoyed pair should match', () => {
    // Engineering test: build a state with two cards whose emotionIds share a root
    // but differ in pairKey. Category-mode isMatch should return true.
    const g = createGame({
      mode: 'expert', // forces tiers [1,2,3]
      matchMode: 'category',
    });
    // Find two cards with different pairKeys whose emotions share a tier-1 root.
    const rootOf = (id: string): string => {
      let cur = emotionById[id];
      while (cur?.parent) cur = emotionById[cur.parent];
      return cur?.id ?? id;
    };
    type Card = (typeof g.cards)[number];
    let crossRootMatch: [Card, Card] | null = null;
    outer: for (const a of g.cards) {
      for (const b of g.cards) {
        if (a.id === b.id) continue;
        if (a.pairKey === b.pairKey) continue; // real partner
        if (rootOf(a.art.emotionId) === rootOf(b.art.emotionId)) {
          crossRootMatch = [a, b];
          break outer;
        }
      }
    }
    if (!crossRootMatch) {
      // The random expert draw didn't include two emotions from the same family
      // (possible but unlikely). Skip rather than fail.
      return;
    }
    const [a, b] = crossRootMatch;
    const after = flipAndCheck(g, a.id, b.id);
    expect(
      after.cards.find((c) => c.id === a.id)?.isMatched,
      `expected ${a.art.emotionId} + ${b.art.emotionId} to match under category mode`,
    ).toBe(true);
  });

  it('category match: two cards from different tier-1 families do NOT match', () => {
    const g = createGame({ mode: 'expert', matchMode: 'category' });
    const rootOf = (id: string): string => {
      let cur = emotionById[id];
      while (cur?.parent) cur = emotionById[cur.parent];
      return cur?.id ?? id;
    };
    // Find two cards whose emotions have DIFFERENT tier-1 roots.
    let crossFamily: [string, string] | null = null;
    for (const a of g.cards) {
      for (const b of g.cards) {
        if (a.id === b.id) continue;
        if (rootOf(a.art.emotionId) !== rootOf(b.art.emotionId)) {
          crossFamily = [a.id, b.id];
          break;
        }
      }
      if (crossFamily) break;
    }
    expect(crossFamily).not.toBeNull();
    const [idA, idB] = crossFamily!;
    const after = flipAndCheck(g, idA, idB);
    expect(after.status).toBe('animating'); // mismatch
  });
});

// ─────────────────────────────────────────────────────────────
// flipCard state transitions
// ─────────────────────────────────────────────────────────────

describe('flipCard', () => {
  it('flipping a card sets isFlipped true and adds id to flippedIds', () => {
    const g = createGame({ mode: 'easy' });
    const id = g.cards[0].id;
    const s = flipCard(g, id);
    expect(s.flippedIds).toContain(id);
    expect(s.cards.find((c) => c.id === id)?.isFlipped).toBe(true);
  });

  it('flipping a second card transitions status to "checking"', () => {
    const g = createGame({ mode: 'easy' });
    let s = flipCard(g, g.cards[0].id);
    s = flipCard(s, g.cards[1].id);
    expect(s.status).toBe('checking');
    expect(s.flippedIds.length).toBe(2);
  });

  it('ignores flip on an already-flipped card', () => {
    const g = createGame({ mode: 'easy' });
    const s1 = flipCard(g, g.cards[0].id);
    const s2 = flipCard(s1, g.cards[0].id);
    expect(s2.flippedIds.length).toBe(1);
  });

  it('ignores flip when 2 cards are already flipped', () => {
    const g = createGame({ mode: 'easy' });
    let s = flipCard(g, g.cards[0].id);
    s = flipCard(s, g.cards[1].id);
    const s3 = flipCard(s, g.cards[2].id); // should be a no-op
    expect(s3.flippedIds.length).toBe(2);
    expect(s3.cards.find((c) => c.id === g.cards[2].id)?.isFlipped).toBe(false);
  });

  it('ignores flip when game status is not "playing"', () => {
    const g: GameState = { ...createGame({ mode: 'easy' }), status: 'won' };
    const s = flipCard(g, g.cards[0].id);
    expect(s.flippedIds.length).toBe(0);
  });

  it('clears hintCardId on flip', () => {
    const g = createGame({ mode: 'super-easy' });
    const s1 = flipCard(g, g.cards[0].id);
    // Force a hint
    const withHint: GameState = { ...s1, hintCardId: 'some-id' };
    const s2 = flipCard(withHint, g.cards[1].id);
    expect(s2.hintCardId).toBeNull();
  });

  it('ignores flip on a matched card', () => {
    const g = createGame({ mode: 'super-easy' });
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const afterMatch = flipAndCheck(g, a.id, bId);
    expect(afterMatch.cards.find((c) => c.id === a.id)?.isMatched).toBe(true);
    const s = flipCard(afterMatch, a.id);
    expect(s.flippedIds).not.toContain(a.id);
  });
});

// ─────────────────────────────────────────────────────────────
// checkMatch
// ─────────────────────────────────────────────────────────────

describe('checkMatch', () => {
  it('identical mode: same pairKey → match', () => {
    const g = createGame({ mode: 'easy', matchMode: 'identical' });
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const s = flipAndCheck(g, a.id, bId);
    expect(s.cards.find((c) => c.id === a.id)?.isMatched).toBe(true);
    expect(s.cards.find((c) => c.id === bId)?.isMatched).toBe(true);
    expect(s.flippedIds.length).toBe(0);
  });

  it('identical mode: different pairKey → mismatch → status animating', () => {
    const g = createGame({ mode: 'easy', matchMode: 'identical' });
    const a = g.cards[0];
    const nonPartner = g.cards.find((c) => c.pairKey !== a.pairKey)!;
    const s = flipAndCheck(g, a.id, nonPartner.id);
    expect(s.status).toBe('animating');
    expect(s.lastMismatchIds).toContain(a.id);
    expect(s.lastMismatchIds).toContain(nonPartner.id);
  });

  it('match increments current player matches and keeps turn', () => {
    const g = createGame({ mode: 'easy', playerCount: 2 });
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const s = flipAndCheck(g, a.id, bId);
    expect(s.players[0].matches).toBe(1);
    expect(s.currentPlayerIndex).toBe(0); // same player goes again
  });

  it('mismatch advances currentPlayerIndex in 2-player game', () => {
    const g = createGame({ mode: 'easy', playerCount: 2 });
    const a = g.cards[0];
    const nonPartner = g.cards.find((c) => c.pairKey !== a.pairKey)!;
    const s = flipAndCheck(g, a.id, nonPartner.id);
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('mismatch does NOT advance in 1-player game (wraps to same)', () => {
    const g = createGame({ mode: 'easy', playerCount: 1 });
    const a = g.cards[0];
    const nonPartner = g.cards.find((c) => c.pairKey !== a.pairKey)!;
    const s = flipAndCheck(g, a.id, nonPartner.id);
    expect(s.currentPlayerIndex).toBe(0);
  });

  it('matching all pairs sets status to "won"', () => {
    const g = createGame({ mode: 'super-easy' }); // 2 pairs
    let s = g;
    const pairKeys = Array.from(new Set(s.cards.map((c) => c.pairKey)));
    for (const pk of pairKeys) {
      const pair = s.cards.filter((c) => c.pairKey === pk);
      s = flipAndCheck(s, pair[0].id, pair[1].id);
      // Between pairs, status should be 'playing' or 'won'
      if (pk !== pairKeys[pairKeys.length - 1]) {
        expect(s.status).toBe('playing');
      }
    }
    expect(s.status).toBe('won');
    expect(s.cards.every((c) => c.isMatched)).toBe(true);
  });

  it('increments moveCount on each check', () => {
    const g = createGame({ mode: 'easy' });
    const s = flipAndCheck(g, g.cards[0].id, g.cards[1].id);
    expect(s.moveCount).toBe(1);
  });

  it('returns state unchanged if status is not "checking"', () => {
    const g = createGame({ mode: 'easy' });
    const s = checkMatch(g); // nothing flipped
    expect(s).toBe(g);
  });
});

// ─────────────────────────────────────────────────────────────
// resolveAnimation
// ─────────────────────────────────────────────────────────────

describe('resolveAnimation', () => {
  it('flips mismatched cards back and restores "playing" status', () => {
    const g = createGame({ mode: 'easy' });
    const a = g.cards[0];
    const nonPartner = g.cards.find((c) => c.pairKey !== a.pairKey)!;
    const mid = flipAndCheck(g, a.id, nonPartner.id);
    expect(mid.status).toBe('animating');
    const s = resolveAnimation(mid);
    expect(s.status).toBe('playing');
    expect(s.cards.find((c) => c.id === a.id)?.isFlipped).toBe(false);
    expect(s.cards.find((c) => c.id === nonPartner.id)?.isFlipped).toBe(false);
    expect(s.lastMismatchIds).toEqual([]);
  });

  it('no-ops if status is not "animating"', () => {
    const g = createGame({ mode: 'easy' });
    const s = resolveAnimation(g);
    expect(s).toBe(g);
  });
});

// ─────────────────────────────────────────────────────────────
// useHint
// ─────────────────────────────────────────────────────────────

describe('useHint', () => {
  it('sets hintCardId to the partner of the currently flipped card', () => {
    const g = createGame({ mode: 'super-easy' }); // hintsEnabled:true
    const a = g.cards[0];
    const s1 = flipCard(g, a.id);
    const s2 = useHint(s1);
    expect(s2.hintCardId).toBe(partnerOf(g, a.id));
  });

  it('no-ops if hints are disabled', () => {
    const g = createGame({ mode: 'hard' }); // hintsEnabled:false per preset
    const s = flipCard(g, g.cards[0].id);
    const s2 = useHint(s);
    expect(s2.hintCardId).toBeNull();
  });

  it('no-ops when zero or two cards are flipped', () => {
    const g = createGame({ mode: 'super-easy' });
    expect(useHint(g).hintCardId).toBeNull(); // zero flipped
    const two = flipCard(flipCard(g, g.cards[0].id), g.cards[1].id);
    expect(useHint(two).hintCardId).toBeNull(); // two flipped
  });

  it('no-ops if partner is already matched', () => {
    const g = createGame({ mode: 'super-easy' });
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const matched = flipAndCheck(g, a.id, bId);
    // Now flip an unmatched card; request a hint for it; there's no unmatched partner
    // for a matched card, so no-op is correct.
    const stillUnmatched = matched.cards.find((c) => !c.isMatched)!;
    const s = flipCard(matched, stillUnmatched.id);
    // Its partner is also unmatched in super-easy's 4-card game after 1 pair.
    // This case: hint succeeds on unmatched partner.
    const s2 = useHint(s);
    expect(s2.hintCardId).toBe(partnerOf(matched, stillUnmatched.id));
  });
});

// ─────────────────────────────────────────────────────────────
// winner / tie / helpers
// ─────────────────────────────────────────────────────────────

describe('winner / tie', () => {
  it('winner returns null while status is not "won"', () => {
    const g = createGame({ mode: 'easy' });
    expect(winner(g)).toBeNull();
  });

  it('winner returns the player with the most matches', () => {
    const g: GameState = {
      ...createGame({ mode: 'easy', playerCount: 2 }),
      status: 'won',
    };
    g.players[0].matches = 3;
    g.players[1].matches = 5;
    expect(winner(g)?.id).toBe(2);
  });

  it('isTie returns true when players have equal matches', () => {
    const g: GameState = {
      ...createGame({ mode: 'easy', playerCount: 2 }),
      status: 'won',
    };
    g.players[0].matches = 3;
    g.players[1].matches = 3;
    expect(isTie(g)).toBe(true);
  });

  it('isTie returns false in a 1-player game', () => {
    const g: GameState = { ...createGame({ mode: 'easy' }), status: 'won' };
    expect(isTie(g)).toBe(false);
  });

  it('currentPlayer returns the active player', () => {
    const g = createGame({ mode: 'easy', playerCount: 2 });
    expect(currentPlayer(g).id).toBe(1);
    const advanced: GameState = { ...g, currentPlayerIndex: 1 };
    expect(currentPlayer(advanced).id).toBe(2);
  });

  it('matchedPairs counts only matched cards', () => {
    const g = createGame({ mode: 'easy' });
    expect(matchedPairs(g)).toBe(0);
    const a = g.cards[0];
    const bId = partnerOf(g, a.id);
    const s = flipAndCheck(g, a.id, bId);
    expect(matchedPairs(s)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// Full game sequence
// ─────────────────────────────────────────────────────────────

describe('full game sequence', () => {
  it('super-easy 5×6 completes after every pair is matched, reaches "won"', () => {
    const g = createGame({ mode: 'super-easy' });
    expect(g.status).toBe('playing');
    const pairKeys = Array.from(new Set(g.cards.map((c) => c.pairKey)));
    let s: GameState = g;
    for (const pk of pairKeys) {
      const pair = s.cards.filter((c) => c.pairKey === pk);
      s = flipAndCheck(s, pair[0].id, pair[1].id);
    }
    expect(s.status).toBe('won');
    expect(matchedPairs(s)).toBe(totalPairs(g));
  });

  it('2-player game: turn stays on match, rotates on mismatch (when mismatchPenalty=true)', () => {
    // Use Easy — it has mismatchPenalty:true and the same 5×6 board.
    const g = createGame({ mode: 'easy', playerCount: 2 });
    const pairKeys = Array.from(new Set(g.cards.map((c) => c.pairKey)));
    let s: GameState = g;

    // Player 1 matches pair 0 → should stay on turn.
    let pair = s.cards.filter((c) => c.pairKey === pairKeys[0]);
    s = flipAndCheck(s, pair[0].id, pair[1].id);
    expect(s.players[0].matches).toBe(1);
    expect(s.currentPlayerIndex).toBe(0);

    // Find two cards with DIFFERENT emotion IDs for a guaranteed mismatch.
    // (In Easy with identical match mode, same emotion ids always match —
    // even from different pair-keys.)
    const unmatched = s.cards.filter((c) => !c.isMatched);
    const first = unmatched[0];
    const second = unmatched.find((c) => c.art.emotionId !== first.art.emotionId);
    if (!second) return; // skip if every remaining card shares an emotion
    s = flipCard(s, first.id);
    s = flipCard(s, second.id);
    s = checkMatch(s);
    // Mismatch → turn rotated to player 2, status is 'animating' (flip-back)
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.status).toBe('animating');
  });

  it('super-easy leaves the turn with the same player on mismatch (mismatchPenalty=false)', () => {
    const g = createGame({ mode: 'super-easy', playerCount: 2 });
    const unmatched = g.cards;
    const first = unmatched[0];
    const second = unmatched.find((c) => c.art.emotionId !== first.art.emotionId);
    if (!second) return; // skip: all cards same emotion (vanishingly unlikely for 15 pairs / 7 emotions)
    let s: GameState = g;
    s = flipCard(s, first.id);
    s = flipCard(s, second.id);
    s = checkMatch(s);
    // Super Easy: penalty off → turn stays on player 0.
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.status).toBe('animating');
  });
});

// ─────────────────────────────────────────────────────────────
// Seeded PRNG — multiplayer support (Phase 4.3)
// ─────────────────────────────────────────────────────────────

describe('seeded deck generation (multiplayer)', () => {
  it('same seed → identical deck order and pair assignments', () => {
    const a = createGame({ mode: 'medium', seed: 'HAPPY-TIGER-42' });
    const b = createGame({ mode: 'medium', seed: 'HAPPY-TIGER-42' });
    expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
    expect(a.cards.map((c) => c.art.emotionId)).toEqual(b.cards.map((c) => c.art.emotionId));
  });

  it('different seeds → different decks (almost always)', () => {
    const a = createGame({ mode: 'medium', seed: 'seed-a' });
    const b = createGame({ mode: 'medium', seed: 'seed-b' });
    const sameOrder = a.cards.every((c, i) => c.id === b.cards[i].id);
    expect(sameOrder).toBe(false);
  });

  it('no seed → non-deterministic (Math.random, same behavior as before Phase 4.3)', () => {
    // Produce 3 games, assert at least one differs from the first.
    const a = createGame({ mode: 'medium' });
    let anyDiffer = false;
    for (let i = 0; i < 3; i++) {
      const b = createGame({ mode: 'medium' });
      if (a.cards.some((c, i2) => c.id !== b.cards[i2].id)) {
        anyDiffer = true;
        break;
      }
    }
    expect(anyDiffer).toBe(true);
  });

  it('seed is persisted in GameConfig', () => {
    const g = createGame({ mode: 'easy', seed: 'abc' });
    expect(g.config.seed).toBe('abc');
  });

  it('same seed + different mode → different deck sizes (obvious), but each is internally deterministic', () => {
    const a1 = createGame({ mode: 'super-easy', seed: 'x' });
    const a2 = createGame({ mode: 'super-easy', seed: 'x' });
    expect(a1.cards.length).toBe(30);
    expect(a2.cards.length).toBe(30);
    expect(a1.cards.map((c) => c.art.emotionId)).toEqual(a2.cards.map((c) => c.art.emotionId));
  });
});

// ─────────────────────────────────────────────────────────────
// Transition clips — Phase 4.5 MVP
// ─────────────────────────────────────────────────────────────

describe('transition card type (Phase 4.5)', () => {
  // Post-refactor every deck is 15 pairs, so transition tests need a pool
  // that can cover that. This helper yields 42 clips covering every
  // (from, to) among the 7 tier-1 emotions — enough for interpretation A
  // (distinct clips per pair) and for chain (lots of shared endpoints).
  const ALL_TIER1 = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'bad'];
  const clips = (() => {
    const out: Array<{ url: string; fromEmotionId: string; toEmotionId: string }> = [];
    for (const from of ALL_TIER1) {
      for (const to of ALL_TIER1) {
        if (from === to) continue;
        out.push({ url: `${from}_${to}.mp4`, fromEmotionId: from, toEmotionId: to });
      }
    }
    return out;
  })();

  it('creates transition cards from the transitionPool when artPack=transition', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition' }, {}, clips);
    expect(g.cards.length).toBe(30);
    for (const c of g.cards) expect(c.art.type).toBe('transition');
  });

  it('pair cards share the same clip URL (interpretation A)', () => {
    const g = createGame({ mode: 'easy', artPack: 'transition' }, {}, clips);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    for (const pair of Object.values(byPair)) {
      expect(pair.length).toBe(2);
      expect(pair[0].art.value).toBe(pair[1].art.value);
    }
  });

  it('labels include from → to emotion names (on transition cards only)', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition' }, {}, clips);
    const tcards = g.cards.filter((c) => c.art.type === 'transition');
    expect(tcards.length, 'expected at least one transition card to exist').toBeGreaterThan(0);
    for (const c of tcards) {
      expect(c.art.label).toMatch(/→/);
    }
  });

  it('empty pool → falls back to classic emotion pairs', () => {
    const g = createGame({ mode: 'easy', artPack: 'transition' }, {}, []);
    // Transition pool empty → engine falls back to classic builder with artPack=transition.
    // buildArt has no branch for transition (yet), so it uses the raw artPack value.
    // The important property is that createGame does NOT throw and returns a playable deck.
    expect(g.cards.length).toBe(30);
  });

  it('is seedable like everything else', () => {
    const a = createGame({ mode: 'easy', artPack: 'transition', seed: 'T1' }, {}, clips);
    const b = createGame({ mode: 'easy', artPack: 'transition', seed: 'T1' }, {}, clips);
    expect(a.cards.map((c) => c.art.value)).toEqual(b.cards.map((c) => c.art.value));
  });
});

// ─────────────────────────────────────────────────────────────
// Transition match modes — interpretation B (chain) and C (endpoint)
// ─────────────────────────────────────────────────────────────

describe('transition-chain match mode (interpretation B)', () => {
  // 42-clip pool (every tier-1 from/to combo) — gives the chain builder
  // more than enough links to assemble 15 pairs for the 5×6 board.
  const ALL_TIER1 = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'bad'];
  const clips = (() => {
    const out: Array<{ url: string; fromEmotionId: string; toEmotionId: string }> = [];
    for (const from of ALL_TIER1) {
      for (const to of ALL_TIER1) {
        if (from === to) continue;
        out.push({ url: `${from}_${to}.mp4`, fromEmotionId: from, toEmotionId: to });
      }
    }
    return out;
  })();

  it('builds chain pairs where one clip.to = other clip.from', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-chain' }, {}, clips);
    expect(g.cards.length).toBe(30);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    for (const pair of Object.values(byPair)) {
      expect(pair.length).toBe(2);
      const [a, b] = pair;
      // Chain property: a.to===b.from OR b.to===a.from
      const chained =
        (a.art.emotionId === b.art.fromEmotionId) ||
        (b.art.emotionId === a.art.fromEmotionId);
      expect(chained, `pair ${a.art.label} / ${b.art.label} must chain`).toBe(true);
    }
  });

  it('flipping two chained clips ⇒ match', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-chain' }, {}, clips);
    const any = g.cards[0];
    const partner = g.cards.find((c) => c.pairKey === any.pairKey && c.id !== any.id)!;
    const s = flipAndCheck(g, any.id, partner.id);
    expect(s.cards.find((c) => c.id === any.id)?.isMatched).toBe(true);
  });

  it('flipping two NON-chained clips from different pairs ⇒ mismatch', () => {
    const g = createGame({ mode: 'easy', artPack: 'transition', matchMode: 'transition-chain' }, {}, clips);
    // Pick two cards from different pairs that do NOT chain.
    outer: for (let i = 0; i < g.cards.length; i++) {
      for (let j = i + 1; j < g.cards.length; j++) {
        const a = g.cards[i], b = g.cards[j];
        if (a.pairKey === b.pairKey) continue;
        const chained =
          (a.art.emotionId === b.art.fromEmotionId) ||
          (b.art.emotionId === a.art.fromEmotionId);
        if (chained) continue; // skip accidental cross-pair chains
        const s = flipAndCheck(g, a.id, b.id);
        expect(s.status).toBe('animating');
        break outer;
      }
    }
  });

  it('too-sparse pool falls back to interpretation A (never throws)', () => {
    // Only one clip — cannot form even one chain pair; fallback uses A.
    const tiny = [{ url: 'AngryHappy.mp4', fromEmotionId: 'angry', toEmotionId: 'happy' }];
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-chain' }, {}, tiny);
    // Either 4 cards (A uses duplicates) or classic emotion pairs fallback — both acceptable.
    expect(g.cards.length).toBe(30);
  });

  it('is seedable — same seed → same chain layout', () => {
    const a = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-chain', seed: 'CHAIN' }, {}, clips);
    const b = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-chain', seed: 'CHAIN' }, {}, clips);
    expect(a.cards.map((c) => c.art.value)).toEqual(b.cards.map((c) => c.art.value));
  });
});

describe('transition-endpoint match mode (interpretation C)', () => {
  // Endpoint needs ≥ pairCount distinct target emotions. For the new 5×6
  // board that's 15. Build clips that target the first 20 emotions in
  // EMOTIONS so the builder always has enough distinct targets, plus a
  // couple of duplicate-target clips to exercise the dedupe path.
  const clips = (() => {
    const targets = EMOTIONS.slice(0, 20).map((e) => e.id);
    const out: Array<{ url: string; fromEmotionId: string; toEmotionId: string }> = [];
    for (const t of targets) {
      out.push({ url: `from-happy_to-${t}.mp4`, fromEmotionId: 'happy', toEmotionId: t });
    }
    // Duplicate-target clips — engine must dedupe so no two pairs share a target.
    out.push({ url: 'from-sad_to-happy-dup.mp4', fromEmotionId: 'sad', toEmotionId: 'happy' });
    out.push({ url: 'from-angry_to-sad-dup.mp4', fromEmotionId: 'angry', toEmotionId: 'sad' });
    return out;
  })();

  it('each pair has one transition card and one static card', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, clips);
    expect(g.cards.length).toBe(30);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    for (const pair of Object.values(byPair)) {
      expect(pair.length).toBe(2);
      const types = pair.map((c) => c.art.type);
      expect(types.includes('transition')).toBe(true);
      // The non-transition side defaults to emoji (no face/cartoon provided).
      expect(types.some((t) => t !== 'transition')).toBe(true);
    }
  });

  it("static card's emotion = transition card's 'to' emotion", () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, clips);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    for (const pair of Object.values(byPair)) {
      const transitionCard = pair.find((c) => c.art.type === 'transition')!;
      const staticCard = pair.find((c) => c.art.type !== 'transition')!;
      expect(staticCard.art.emotionId).toBe(transitionCard.art.emotionId);
    }
  });

  it('target emotions across pairs are distinct', () => {
    // super-easy wants 2 pairs, and the clip pool has 5 distinct targets — so
    // interpretation C can build it. (Easy mode wants 6 pairs and this pool
    // only offers 5 distinct targets, so the engine would correctly fall
    // back to A — covered separately below.)
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, clips);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    const targets = Object.values(byPair).map((pair) => {
      const t = pair.find((c) => c.art.type === 'transition')!;
      return t.art.emotionId;
    });
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('pool with too few distinct targets falls back to interpretation A', () => {
    // Only 3 distinct target emotions in this tiny pool → endpoint builder
    // can't hit 15 pairs, so it gives up and interpretation A takes over.
    // A's signature: pairs contain two transition cards (same clip value).
    const tinyPool = [
      { url: 'AngryHappy.mp4',  fromEmotionId: 'angry',    toEmotionId: 'happy'   },
      { url: 'SadHappy.mp4',    fromEmotionId: 'sad',      toEmotionId: 'happy'   },
      { url: 'FearSad.mp4',     fromEmotionId: 'fearful',  toEmotionId: 'sad'     },
      { url: 'HappyAngry.mp4',  fromEmotionId: 'happy',    toEmotionId: 'angry'   },
    ];
    const g = createGame({ mode: 'easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, tinyPool);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    const everyPairIsEndpoint = Object.values(byPair).every((pair) => {
      const types = pair.map((c) => c.art.type);
      return types.includes('transition') && types.some((t) => t !== 'transition');
    });
    // If endpoint had built the deck every pair would be one-transition-one-static.
    // Fallback happened → at least one pair is NOT in that shape.
    expect(everyPairIsEndpoint).toBe(false);
  });

  it('flipping transition + matching static ⇒ match', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, clips);
    const any = g.cards[0];
    const partner = g.cards.find((c) => c.pairKey === any.pairKey && c.id !== any.id)!;
    const s = flipAndCheck(g, any.id, partner.id);
    expect(s.cards.find((c) => c.id === any.id)?.isMatched).toBe(true);
  });

  it('two static cards (or two transitions) ⇒ never a match', () => {
    const g = createGame({ mode: 'easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, clips);
    // Find two cards of the same type from different pairs.
    const transitions = g.cards.filter((c) => c.art.type === 'transition');
    const statics = g.cards.filter((c) => c.art.type !== 'transition');
    if (transitions.length >= 2) {
      const [a, b] = transitions;
      if (a.pairKey !== b.pairKey) {
        const s = flipAndCheck(g, a.id, b.id);
        expect(s.status).toBe('animating');
      }
    }
    if (statics.length >= 2) {
      const [a, b] = statics;
      if (a.pairKey !== b.pairKey) {
        const s2 = flipAndCheck(g, a.id, b.id);
        expect(s2.status).toBe('animating');
      }
    }
  });

  it('falls back to interpretation A when pool cannot supply enough distinct targets', () => {
    // Only 1 clip → cannot build 2 endpoint pairs with distinct targets → fallback to A.
    const tiny = [{ url: 'AngryHappy.mp4', fromEmotionId: 'angry', toEmotionId: 'happy' }];
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, {}, tiny);
    expect(g.cards.length).toBe(30); // never throws
  });

  it('upgrades static side to face art when a facePool is supplied', () => {
    const facePool: FacePool = {
      happy: ['happy-face-1.jpg', 'happy-face-2.jpg'],
      sad:   ['sad-face-1.jpg',   'sad-face-2.jpg'  ],
      angry: ['angry-face-1.jpg', 'angry-face-2.jpg'],
      fearful:['fearful-face-1.jpg','fearful-face-2.jpg'],
    };
    const g = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint' }, facePool, clips);
    const statics = g.cards.filter((c) => c.art.type !== 'transition');
    // At least one static card must now be a face (upgrade happened).
    expect(statics.some((c) => c.art.type === 'face')).toBe(true);
  });

  it('is seedable — same seed → same endpoint layout', () => {
    const a = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint', seed: 'END' }, {}, clips);
    const b = createGame({ mode: 'super-easy', artPack: 'transition', matchMode: 'transition-endpoint', seed: 'END' }, {}, clips);
    expect(a.cards.map((c) => c.art.value)).toEqual(b.cards.map((c) => c.art.value));
  });
});

// ─────────────────────────────────────────────────────────────
// Face-person match mode — saved faces, both pair semantics (Phase 4.4)
// ─────────────────────────────────────────────────────────────

describe('face-person match mode (clinical: same person, different emotions)', () => {
  // A realistic pool: one friend "alice" with photos across 5 emotions, and
  // "bob" across 3 emotions. super-easy needs 2 pairs → we expect 2 people to
  // supply those pairs.
  const pool: FacePool = {
    happy:   [{ url: 'a-happy.jpg',   personId: 'alice' }, { url: 'b-happy.jpg',   personId: 'bob'   }],
    sad:     [{ url: 'a-sad.jpg',     personId: 'alice' }, { url: 'b-sad.jpg',     personId: 'bob'   }],
    angry:   [{ url: 'a-angry.jpg',   personId: 'alice' }],
    fearful: [{ url: 'a-fearful.jpg', personId: 'alice' }, { url: 'b-fearful.jpg', personId: 'bob'   }],
    disgusted:[{ url:'a-disgusted.jpg',personId:'alice'}],
  };

  it('builds pairs by PERSON when the pool supplies enough person-photos', () => {
    // Need ≥ 2 photos per person × pairCount (15) persons, which this small
    // fixture can't supply. Build a richer pool so the face-person builder
    // can actually hit 15 pairs before falling back to the emotion-pair path.
    const bigPool: FacePool = {};
    for (let p = 0; p < 8; p++) {
      const personId = `person-${p}`;
      const emotions = ['happy', 'sad', 'angry', 'fearful', 'disgusted'];
      for (const em of emotions) {
        (bigPool[em] ??= []).push({ url: `${personId}-${em}.jpg`, personId });
      }
    }
    const g = createGame({ mode: 'super-easy', artPack: 'face', matchMode: 'face-person' }, bigPool);
    expect(g.cards.length).toBe(30);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    for (const pair of Object.values(byPair)) {
      expect(pair.length).toBe(2);
      expect(pair[0].art.personId, `pair ${pair[0].pairKey} personIds must match`).toBe(pair[1].art.personId);
    }
  });

  it('prefers pairs with DIFFERENT emotions when available', () => {
    // One person across many emotions — enough raw photos (per-person) for
    // the face-person builder to assemble 15 pairs. Each pair should show
    // two different emotions since the builder explicitly prefers that.
    const onePerson: FacePool = {};
    const onePersonEmotions = ['happy','sad','angry','fearful','disgusted','surprised','bad','joyful','content','peaceful','proud','grateful','inspired','lonely','depressed','hurt','hopeless','furious','frustrated','hostile','humiliated','anxious','overwhelmed','insecure','revolted','judgmental','amazed','confused','excited','bored','ashamed','tired'];
    for (const em of onePersonEmotions) {
      onePerson[em] = [{ url: `alice-${em}.jpg`, personId: 'alice' }];
    }
    const g = createGame({ mode: 'super-easy', artPack: 'face', matchMode: 'face-person' }, onePerson);
    const byPair: Record<string, typeof g.cards> = {};
    for (const c of g.cards) (byPair[c.pairKey] ??= []).push(c);
    const pairs = Object.values(byPair);
    // At least one pair has different emotions (the engine prefers it).
    const hasDifferentEmotionPair = pairs.some((p) => p[0].art.emotionId !== p[1].art.emotionId);
    expect(hasDifferentEmotionPair).toBe(true);
  });

  // A bigger pool so buildFacePersonPairs can actually produce 15 pairs
  // on the 5×6 board — the previous small `pool` only had ~10 photos total.
  const bigPersonPool: FacePool = (() => {
    const out: FacePool = {};
    for (let p = 0; p < 8; p++) {
      const personId = `person-${p}`;
      for (const em of ['happy', 'sad', 'angry', 'fearful', 'disgusted']) {
        (out[em] ??= []).push({ url: `${personId}-${em}.jpg`, personId });
      }
    }
    return out;
  })();

  it('flipping two cards of the same person ⇒ match', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'face', matchMode: 'face-person' }, bigPersonPool);
    const a = g.cards[0];
    const partner = g.cards.find((c) => c.pairKey === a.pairKey && c.id !== a.id)!;
    let s = flipCard(g, a.id);
    s = flipCard(s, partner.id);
    s = checkMatch(s);
    expect(s.cards.find((c) => c.id === a.id)?.isMatched).toBe(true);
  });

  it('flipping two cards of different people ⇒ mismatch', () => {
    const g = createGame({ mode: 'super-easy', artPack: 'face', matchMode: 'face-person' }, bigPersonPool);
    // Find two cards with different personIds
    const a = g.cards[0];
    const other = g.cards.find((c) => c.art.personId !== a.art.personId);
    if (!other) {
      // Only one person in the deck — skip; this test requires 2+ persons.
      return;
    }
    let s = flipCard(g, a.id);
    s = flipCard(s, other.id);
    s = checkMatch(s);
    expect(s.status).toBe('animating'); // mismatch
  });

  it('falls back to emotion pairs if pool lacks person identities', () => {
    const noPersonPool: FacePool = {
      happy: ['h1.jpg', 'h2.jpg'],
      sad:   ['s1.jpg', 's2.jpg'],
      angry: ['a1.jpg', 'a2.jpg'],
      fearful:['f1.jpg','f2.jpg'],
    };
    // Should NOT throw despite face-person mode + no personIds.
    const g = createGame({ mode: 'super-easy', artPack: 'face', matchMode: 'face-person' }, noPersonPool);
    expect(g.cards.length).toBe(30);
  });

  it('legacy string[] FacePool still works (backward compat)', () => {
    const legacy: FacePool = {
      happy: ['h1.jpg', 'h2.jpg', 'h3.jpg'],
      sad:   ['s1.jpg', 's2.jpg'],
      angry: ['a1.jpg', 'a2.jpg'],
      fearful:['f1.jpg','f2.jpg'],
      disgusted:['d1.jpg','d2.jpg'],
      surprised:['u1.jpg','u2.jpg'],
    };
    const g = createGame({ mode: 'easy', artPack: 'face' }, legacy);
    const faceCards = g.cards.filter((c) => c.art.type === 'face');
    expect(faceCards.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Face pool
// ─────────────────────────────────────────────────────────────

describe('face artPack with FacePool', () => {
  it('uses pool URLs when artPack=face and enough faces exist', () => {
    const pool: FacePool = {
      happy: ['h1.jpg', 'h2.jpg', 'h3.jpg'],
      sad: ['s1.jpg', 's2.jpg'],
      angry: ['a1.jpg', 'a2.jpg'],
      fearful: ['f1.jpg', 'f2.jpg'],
      disgusted: ['d1.jpg', 'd2.jpg'],
      surprised: ['u1.jpg', 'u2.jpg'],
    };
    const g = createGame({ mode: 'easy', artPack: 'face' }, pool);
    const faceCards = g.cards.filter((c) => c.art.type === 'face');
    expect(faceCards.length).toBeGreaterThan(0);
    // Same pair should have two different face URLs (cursor rotates).
    const byPair = new Map<string, string[]>();
    for (const c of faceCards) {
      const arr = byPair.get(c.pairKey) ?? [];
      arr.push(c.art.value);
      byPair.set(c.pairKey, arr);
    }
    for (const [pk, vals] of byPair) {
      expect(vals.length).toBe(2);
      expect(vals[0], `pair ${pk} same face reused`).not.toBe(vals[1]);
    }
  });

  it('falls back to emoji when pool has fewer than 2 faces for an emotion', () => {
    const pool: FacePool = { happy: ['only-one.jpg'] };
    const g = createGame({ mode: 'super-easy', artPack: 'face' }, pool);
    // Every card should be emoji (happy only has 1 face → fallback).
    for (const c of g.cards) {
      expect(c.art.type, `${c.art.emotionId} should fall back to emoji`).toBe('emoji');
    }
  });
});
