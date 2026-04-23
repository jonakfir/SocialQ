<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
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
    MODE_PRESETS,
    MODE_LABELS,
    type GameState,
    type GameMode,
    type ArtType,
    type FacePool,
    type MemoryCard,
  } from '$lib/memoryGame/engine';
  import { emotionById } from '$lib/memoryGame/emotions';

  // ── Server data ──────────────────────────────────────────────
  export let data: {
    facePool: FacePool;
    friendId?: string | null;
    transitionPool?: Array<{ url: string; fromEmotionId: string; toEmotionId: string }>;
    user?: { id?: string | number; email?: string } | null;
  };
  $: facePool = data?.facePool ?? {};
  $: transitionPool = data?.transitionPool ?? [];
  $: friendDeckId = data?.friendId ?? null;

  // ── Multiplayer seed (Phase 4.3) ────────────────────────────
  // If the URL has ?seed=... (optionally ?mode=&art=&match=), apply those to the
  // lobby selections and auto-start so the invited friend lands on the same deck.
  let shareURL = '';
  let shareCopied = false;

  function generateSeed(): string {
    // Short, memorable-ish code (adjective-noun-digits). Not cryptographically
    // meaningful — just enough entropy for unique-per-session games.
    const adj = ['happy','sad','brave','calm','clever','fuzzy','mighty','swift','gentle','eager'];
    const noun = ['tiger','owl','fox','whale','lion','panda','hawk','otter','bear','wolf'];
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const n = Math.floor(Math.random() * 90) + 10;
    return `${pick(adj)}-${pick(noun)}-${n}`;
  }

  // Share URL carries just (seed, mode) — everything else is derived from
  // the preset so the invited friend's deck mirrors ours when they pick the
  // same difficulty (which we set from `mode` on arrival).
  function readSeedFromURL(): { seed?: string; mode?: GameMode } {
    if (typeof window === 'undefined') return {};
    const u = new URL(window.location.href);
    const s = u.searchParams.get('seed') || undefined;
    const m = u.searchParams.get('mode') as GameMode | null;
    return { seed: s || undefined, mode: m || undefined };
  }

  function buildShareURL(seed: string): string {
    if (typeof window === 'undefined') return '';
    const u = new URL('/memory', window.location.origin);
    u.searchParams.set('seed', seed);
    u.searchParams.set('mode', chosenMode);
    return u.toString();
  }

  async function shareCurrentGame() {
    if (!game?.config.seed) return;
    const url = buildShareURL(game.config.seed);
    shareURL = url;
    const shareText = `I'm playing "Good with Faces" on SocialQ — match my deck! ${url}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Good with Faces', text: shareText, url });
        return;
      }
    } catch {/* user cancelled share sheet — fall through to clipboard */}
    try {
      await navigator.clipboard?.writeText(url);
      shareCopied = true;
      setTimeout(() => { shareCopied = false; }, 2000);
    } catch {/* best effort */}
  }

  // ── State ────────────────────────────────────────────────────
  let screen: 'lobby' | 'playing' | 'won' = 'lobby';
  let game: GameState | null = null;

  let chosenMode: GameMode = 'easy';
  let playerCount: 1 | 2 = 1;
  let player1Name = 'Player 1';
  let player2Name = 'Player 2';

  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;

  // Art pack and match mode used to be user-selectable, but per product
  // direction the difficulty now owns both (see MODE_PRESETS in engine.ts).
  // The lobby therefore exposes Difficulty + Players only; startGame()
  // doesn't pass artPack/matchMode so the engine reads them from the preset.

  const MODES = Object.keys(MODE_PRESETS) as GameMode[];
  // Every level is 5×6 now — the grid size used to scale with difficulty,
  // but the escalation is in tier depth / match mode / art / time instead.
  const MODE_GRID: Record<GameMode, string> = {
    'super-easy': '5×6',
    'easy':       '5×6',
    'medium':     '5×6',
    'hard':       '5×6',
    'expert':     '5×6',
  };
  // Tiny caption under the level name in the button — just enough to hint
  // at the vibe. The full descriptor shows via MODE_PRESETS[mode].summary
  // underneath the grid once a level is selected.
  const MODE_TAGS: Record<GameMode, string> = {
    'super-easy': 'emoji · hints · no fail',
    'easy':       'cartoon · hints',
    'medium':     'cross-art · timed',
    'hard':       'real faces · category',
    'expert':     'transitions · chain',
  };

  // ── Start / stop ─────────────────────────────────────────────
  function startGame(opts: { seed?: string } = {}) {
    if (mismatchTimer) clearTimeout(mismatchTimer);
    if (hintTimer) clearTimeout(hintTimer);
    if (clockInterval) clearInterval(clockInterval);

    // Always assign a seed so the game is reproducibly sharable — if the URL
    // provided one we use it; otherwise generate a new short code.
    const seed = opts.seed ?? generateSeed();

    // Only pass mode + playerCount + seed. Art pack, match mode, tiers,
    // hints, audio, time limit, and mismatch penalty all come from
    // MODE_PRESETS[mode] inside createGame.
    game = createGame({
      mode: chosenMode,
      playerCount,
      seed,
    }, facePool, transitionPool);
    if (game) {
      // Tie Player 1 name to the account when signed in (account-tied identity,
      // per the multiplayer spec). Friend on the other device sees "Jon" etc.
      const accountName = (data?.user?.email as string | undefined)?.split('@')[0];
      game.players[0].name = player1Name || accountName || 'Player 1';
      if (playerCount === 2 && game.players[1]) game.players[1].name = player2Name || 'Player 2';
    }
    screen = 'playing';
    startClock();
  }

  function goToLobby() {
    if (clockInterval) clearInterval(clockInterval);
    screen = 'lobby';
  }

  function exitToDashboard() {
    if (clockInterval) clearInterval(clockInterval);
    if (mismatchTimer) clearTimeout(mismatchTimer);
    if (hintTimer) clearTimeout(hintTimer);
    goto('/dashboard');
  }

  function startClock() {
    clockInterval = setInterval(() => {
      if (!game) return;
      game.elapsedMs = Date.now() - game.startTime;
      if (game.config.timeLimitMs && game.elapsedMs >= game.config.timeLimitMs) endGame();
    }, 500);
  }

  function endGame() {
    if (clockInterval) clearInterval(clockInterval);
    if (game) game = { ...game, status: 'won' };
    screen = 'won';
  }

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Card interaction ─────────────────────────────────────────
  function handleCardClick(cardId: string) {
    if (!game || game.status !== 'playing') return;
    game = flipCard(game, cardId);

    if (game.flippedIds.length === 1) {
      // Hint should start ticking as soon as one card is flipped (super-easy UX).
      scheduleHint();
    } else if (game.flippedIds.length === 2) {
      // Second flip → check after a short beat so the player sees both faces.
      if (hintTimer) clearTimeout(hintTimer); // cancel pending hint for the first flip
      mismatchTimer = setTimeout(() => {
        if (!game) return;
        game = checkMatch(game!);
        if (game.status === 'won') { endGame(); return; }
        if (game.status === 'animating') {
          mismatchTimer = setTimeout(() => {
            if (!game) return;
            game = resolveAnimation(game!);
            // Deliberately do NOT re-schedule hint here — next flip handles it.
          }, 650);
        }
      }, 550);
    }
  }

  function scheduleHint() {
    if (!game?.config.hintsEnabled) return;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (!game || game.flippedIds.length !== 1) return;
      game = useHint(game);
    }, game.config.hintDelayMs);
  }

  let speechDisabled = false;

  function speak(text: string) {
    if (speechDisabled) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    // Some browsers (iOS Safari, restricted contexts) throw on construct or speak().
    // Fail soft: log once, disable speech for the session, let the game continue silently.
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('[memory] speech synthesis unavailable; disabling audio for this session', err);
      speechDisabled = true;
    }
  }

  $: if (game?.flippedIds.length === 1 && game.config.audioEnabled) {
    const c = game.cards.find(c => c.id === game!.flippedIds[0]);
    if (c) speak(c.art.label);
  }

  // ── Helpers ──────────────────────────────────────────────────
  function cardColor(card: MemoryCard): string {
    return emotionById[card.art.emotionId]?.color ?? '#3B82F6';
  }

  // Puzzle-piece clip-path: each card gets an interlocking jigsaw shape
  // determined by its (col, row) position. Shared edges between adjacent
  // cards are complementary (one tab, the other notch) so pieces visually
  // interlock when rendered edge-to-edge with no gap.
  function puzzlePath(col: number, row: number, cols: number, rows: number): string {
    const hash = (a: number, b: number) => {
      const s = Math.sin(a * 12.9898 + b * 78.233 + 1.3) * 43758.5453;
      return s - Math.floor(s);
    };
    // For each internal edge: canonical direction +1 or -1, assigned by hash.
    // This card sees the edge from its own perspective; the neighbor sees the opposite.
    // topDir/leftDir use the edge's "owner" hash directly; bottomDir/rightDir invert
    // (because those shared edges are "owned" by the neighbor).
    const topDir    = row === 0 ? 0 : (hash(col, row * 2) > 0.5 ? 1 : -1);
    const leftDir   = col === 0 ? 0 : (hash(col * 2 + 7, row) > 0.5 ? 1 : -1);
    const bottomDir = row === rows - 1 ? 0 : -(hash(col, (row + 1) * 2) > 0.5 ? 1 : -1);
    const rightDir  = col === cols - 1 ? 0 : -(hash((col + 1) * 2 + 7, row) > 0.5 ? 1 : -1);

    const T = 0.10;       // tab depth (fraction of bounding box) — smaller = more body visible
    const S = 1 - T;      // inner body extent
    const NW = 0.28;      // neck width along edge

    const yTop    = topDir === 0    ? 0 : T;
    const xRight  = rightDir === 0  ? 1 : S;
    const yBottom = bottomDir === 0 ? 1 : S;
    const xLeft   = leftDir === 0   ? 0 : T;

    function edge(x1: number, y1: number, x2: number, y2: number, dir: number, side: string): string {
      if (dir === 0) return `L ${x2} ${y2} `;
      let ox = 0, oy = 0;
      if (side === 'top')    oy = -1;
      else if (side === 'right')  ox =  1;
      else if (side === 'bottom') oy =  1;
      else if (side === 'left')   ox = -1;
      const bump = T * dir;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ex = dx / len, ey = dy / len;
      const n1x = x1 + ex * len * (0.5 - NW / 2);
      const n1y = y1 + ey * len * (0.5 - NW / 2);
      const n2x = x1 + ex * len * (0.5 + NW / 2);
      const n2y = y1 + ey * len * (0.5 + NW / 2);
      const c1x = n1x + ox * bump * 1.5 - ex * 0.04;
      const c1y = n1y + oy * bump * 1.5 - ey * 0.04;
      const c2x = n2x + ox * bump * 1.5 + ex * 0.04;
      const c2y = n2y + oy * bump * 1.5 + ey * 0.04;
      return `L ${n1x} ${n1y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${n2x} ${n2y} L ${x2} ${y2} `;
    }

    let d = `M ${xLeft} ${yTop} `;
    d += edge(xLeft,  yTop,    xRight,  yTop,    topDir,    'top');
    d += edge(xRight, yTop,    xRight,  yBottom, rightDir,  'right');
    d += edge(xRight, yBottom, xLeft,   yBottom, bottomDir, 'bottom');
    d += edge(xLeft,  yBottom, xLeft,   yTop,    leftDir,   'left');
    return d + 'Z';
  }

  $: puzzlePaths = game
    ? game.cards.map((_, i) => puzzlePath(i % game!.cols, Math.floor(i / game!.cols), game!.cols, game!.rows))
    : [];

  function onFaceImgError(e: Event) {
    const t = e.target as HTMLImageElement | null;
    if (!t) return;
    t.style.display = 'none';
    const next = t.nextElementSibling as HTMLElement | null;
    if (next) next.style.display = 'flex';
  }

  // Cartoon PNG missing (e.g. tier-3 emotion whose art hasn't been dropped in yet)
  // → swap to the emoji fallback sibling. Same pattern as face fallback above.
  function onCartoonImgError(e: Event) {
    const t = e.target as HTMLImageElement | null;
    if (!t) return;
    t.style.display = 'none';
    const next = t.nextElementSibling as HTMLElement | null;
    if (next) next.style.display = 'flex';
  }

  // ── Derived ──────────────────────────────────────────────────
  $: won    = game ? winner(game) : null;
  $: tie    = game ? isTie(game) : false;
  $: elapsed = game ? formatTime(game.elapsedMs) : '0:00';
  $: timeLeft = game?.config.timeLimitMs
    ? formatTime(Math.max(0, game.config.timeLimitMs - game.elapsedMs)) : null;
  $: progress  = game ? (matchedPairs(game) / totalPairs(game)) * 100 : 0;
  $: gridStyle = game
    ? `--cols:${game.cols}; --rows:${game.rows};`
    : '';
  $: isUrgent = game?.config.timeLimitMs != null && game.elapsedMs > game.config.timeLimitMs * 0.8;

  // ── Board sizing ─────────────────────────────────────────────
  // aspect-ratio CSS alone doesn't work reliably for a grid with `1fr` tracks
  // inside an indeterminate flex parent — at large viewports the grid collapses
  // to 0. We compute the board's pixel size explicitly: fit inside the wrap
  // whichever dimension is limiting, maintaining the cols/rows aspect ratio.
  let boardWrapEl: HTMLElement;
  let boardSize: { w: number; h: number } | null = null;

  function computeBoardSize() {
    if (!boardWrapEl || !game) return;
    const rect = boardWrapEl.getBoundingClientRect();
    const pad = 4; // breathing room from the wrap edges — small so pieces are as big as possible
    const availW = Math.max(0, rect.width - pad);
    const availH = Math.max(0, rect.height - pad);
    if (availW <= 0 || availH <= 0) return;
    const aspect = game.cols / game.rows;
    let w = availW;
    let h = availW / aspect;
    if (h > availH) {
      h = availH;
      w = availH * aspect;
    }
    boardSize = { w: Math.floor(w), h: Math.floor(h) };
  }

  // Recompute on mount, on window resize, and whenever the game (re)starts.
  $: if (game && typeof window !== 'undefined') {
    // Defer to next frame so the DOM has laid out the wrap after a screen transition.
    requestAnimationFrame(computeBoardSize);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', computeBoardSize);
  }

  onDestroy(() => {
    if (clockInterval) clearInterval(clockInterval);
    if (mismatchTimer) clearTimeout(mismatchTimer);
    if (hintTimer) clearTimeout(hintTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', computeBoardSize);
    }
  });

  // If we were invited via a share URL, hydrate the lobby choices and auto-start.
  onMount(() => {
    const { seed, mode } = readSeedFromURL();
    if (!seed) return;
    if (mode) chosenMode = mode;
    // Short delay so reactive state settles before start.
    requestAnimationFrame(() => startGame({ seed }));
  });
</script>

<svelte:head>
  <title>Good with Faces · SocialQ</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  LOBBY                                                       -->
<!-- ═══════════════════════════════════════════════════════════ -->

{#if screen === 'lobby'}
<div class="stage lobby-stage">
  <!-- Ambient blobs -->
  <div class="blob b1" aria-hidden="true"></div>
  <div class="blob b2" aria-hidden="true"></div>

  <!-- Exit to SocialQ dashboard -->
  <button class="exit-btn" on:click={exitToDashboard} aria-label="Back to SocialQ dashboard">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
    <span>Dashboard</span>
  </button>

  <div class="lobby-wrap">
    <!-- Logo / hero -->
    <div class="hero-head">
      <!-- SocialQ logo mark -->
      <svg class="sq-logo" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SocialQ">
        <circle cx="28" cy="28" r="27" stroke="white" stroke-width="2"/>
        <circle cx="20" cy="24" r="3.5" fill="white"/>
        <circle cx="36" cy="24" r="3.5" fill="white"/>
        <path d="M18 34 Q28 42 38 34" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
      <div class="hero-title">
        <span class="ht-good">GOOD</span>
        <span class="ht-with">with</span>
        <span class="ht-faces">FACES</span>
      </div>
      <p class="hero-sub">Match the emotions · by <strong>SocialQ</strong></p>
    </div>

    <div class="lobby-card">
      <!-- Difficulty — name only, no meta. Per product direction the five
           levels should feel like a simple ladder; detailed settings are
           hidden in the preset and never shown in the lobby. -->
      <div class="field-label">Difficulty</div>
      <div class="mode-grid">
        {#each MODES as m}
          <button class="mode-btn" class:sel={chosenMode === m} on:click={() => chosenMode = m}>
            <span class="mode-name">{MODE_LABELS[m]}</span>
          </button>
        {/each}
      </div>

      {#if friendDeckId}
        <!-- Indicator that the loader pulled in a friend's photo deck via ?friend= -->
        <div class="deck-chip" title="Playing with a friend's photo deck">
          <span class="deck-dot"></span>
          Deck: friend <code>{friendDeckId}</code>
        </div>
      {/if}

      <!-- Players -->
      <div class="field-label">Players</div>
      <div class="pill-row">
        <button class="pill-btn" class:sel={playerCount === 1} on:click={() => playerCount = 1}>Solo</button>
        <button class="pill-btn" class:sel={playerCount === 2} on:click={() => playerCount = 2}>2 Players</button>
      </div>

      {#if playerCount === 2}
      <div class="names-row">
        <input class="name-in" bind:value={player1Name} placeholder="Player 1" maxlength={14} />
        <span class="vs-sep">vs</span>
        <input class="name-in" bind:value={player2Name} placeholder="Player 2" maxlength={14} />
      </div>
      {/if}

      <button class="cta-btn" on:click={() => startGame()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Match the Emotions!
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  PLAYING                                                     -->
<!-- ═══════════════════════════════════════════════════════════ -->

{:else if screen === 'playing' && game}
<div class="stage game-stage">

  <!-- Top bar -->
  <header class="topbar">
    <button class="back-btn" on:click={goToLobby} aria-label="Back to menu">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="home-btn" on:click={exitToDashboard} aria-label="Back to SocialQ dashboard" title="Dashboard">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21a1.5 1.5 0 0 1-1.5 1.5H15V15H9v7.5H4.5A1.5 1.5 0 0 1 3 21z"/>
      </svg>
    </button>

    <div class="topbar-brand">
      <svg class="sq-logo-sm" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="28" cy="28" r="27" stroke="white" stroke-width="2.5"/>
        <circle cx="20" cy="24" r="3.5" fill="white"/>
        <circle cx="36" cy="24" r="3.5" fill="white"/>
        <path d="M18 34 Q28 42 38 34" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
      <span class="topbar-title">
        <b class="tb-good">GOOD</b> <i class="tb-with">with</i> <b class="tb-faces">FACES</b>
      </span>
    </div>

    <div class="topbar-right">
      <!-- Progress ring -->
      <svg class="ring" viewBox="0 0 36 36" aria-label="{matchedPairs(game)}/{totalPairs(game)} pairs">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/>
        <circle cx="18" cy="18" r="15" fill="none" stroke="#FFD700" stroke-width="3"
          stroke-dasharray="{(progress / 100) * 94.25} 94.25"
          stroke-dashoffset="23.56" stroke-linecap="round"/>
        <text x="18" y="22" text-anchor="middle" font-size="9" font-weight="700" fill="white">
          {matchedPairs(game)}/{totalPairs(game)}
        </text>
      </svg>

      {#if timeLeft !== null}
        <div class="clock" class:urgent={isUrgent}>⏱ {timeLeft}</div>
      {:else}
        <div class="clock">{elapsed}</div>
      {/if}
    </div>
  </header>

  <!-- Progress bar -->
  <div class="prog-wrap" role="progressbar" aria-valuenow={progress} aria-valuemax={100}>
    <div class="prog-fill" style="width:{progress}%"></div>
  </div>

  <!-- Puzzle-piece clip-paths: one per card. Uses objectBoundingBox units so
       the path scales to each card's size. Shared edges between neighboring
       cards are complementary (tab ↔ notch) giving a jigsaw look. -->
  <svg aria-hidden="true" width="0" height="0" style="position:absolute">
    <defs>
      {#each puzzlePaths as d, i}
        <clipPath id="puzzle-{i}" clipPathUnits="objectBoundingBox">
          <path d={d} />
        </clipPath>
      {/each}
    </defs>
  </svg>

  <!-- Board -->
  <div class="board-wrap" bind:this={boardWrapEl}>
    <div class="board" style="{gridStyle} {boardSize ? `width:${boardSize.w}px; height:${boardSize.h}px;` : ''}">
    {#each game.cards as card, i (card.id)}
      <div class="card-slot">
      <button
        class="card"
        class:flipped={card.isFlipped || card.isMatched}
        class:matched={card.isMatched}
        class:mismatch={game.lastMismatchIds.includes(card.id)}
        class:hint={game.hintCardId === card.id}
        on:click={() => handleCardClick(card.id)}
        disabled={card.isFlipped || card.isMatched || game.status !== 'playing'}
        aria-label={card.isFlipped ? card.art.label : 'Hidden card'}
        style="--deal-delay: {i * 30}ms; clip-path: url(#puzzle-{i});"
      >
        <div class="card-inner">
          <!-- Back -->
          <div class="card-back">
            <svg class="back-puzzle" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="28" cy="28" r="27" stroke="rgba(255,255,255,.2)" stroke-width="2"/>
              <circle cx="20" cy="24" r="3" fill="rgba(255,255,255,.18)"/>
              <circle cx="36" cy="24" r="3" fill="rgba(255,255,255,.18)"/>
              <path d="M18 34 Q28 41 38 34" stroke="rgba(255,255,255,.2)" stroke-width="2" stroke-linecap="round" fill="none"/>
            </svg>
            <span class="back-q">?</span>
          </div>
          <!-- Front -->
          <div class="card-front" style="--ec:{cardColor(card)}">
            <!-- Labels are gated on `isMatched`. Rationale: the game tests
                 whether the player can NAME the emotion — if the label is
                 visible while flipping, they're just matching text. The
                 label only reveals after a successful match, confirming the
                 emotion the player already identified. -->
            {#if card.art.type === 'face'}
              <img src={card.art.value} alt={card.art.label} class="face-img"
                on:error={onFaceImgError}
              />
              <div class="face-fallback" style="display:none">
                <span class="card-emoji">{emotionById[card.art.emotionId]?.emoji ?? '😐'}</span>
              </div>
            {:else if card.art.type === 'cartoon'}
              <img src={card.art.value} alt={card.art.label} class="cartoon-img" on:error={onCartoonImgError} />
              <div class="cartoon-fallback" style="display:none">
                <span class="card-emoji">{emotionById[card.art.emotionId]?.emoji ?? '😐'}</span>
              </div>
            {:else if card.art.type === 'transition'}
              <!-- Short mp4 of an emotion transition (e.g. Angry → Happy).
                   Autoplay muted so iOS Safari allows it; loop so the clip keeps
                   replaying while the card is face-up; no controls for clean UX. -->
              <video
                class="transition-vid"
                src={card.art.value}
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
                aria-label={card.art.label}
              ></video>
            {:else}
              <span class="card-emoji">{card.art.value}</span>
            {/if}
          </div>
        </div>
      </button>
        {#if card.isMatched}
          <!-- Render label OUTSIDE the .card's clip-path so the text doesn't
               get sliced off by the puzzle-piece tabs/notches. -->
          <div class="match-label" style="--ec:{cardColor(card)}">{card.art.label}</div>
        {/if}
      </div>
    {/each}
    </div>
  </div>

  <!-- Player bar -->
  <div class="player-bar">
    {#each game.players as p, i}
      <div class="player-chip" class:active={i === game.currentPlayerIndex}>
        <div class="p-avatar">{p.name.charAt(0).toUpperCase()}</div>
        <div class="p-info">
          <span class="p-name">{p.name}</span>
          <span class="p-badge" class:your-turn={i === game.currentPlayerIndex}>
            {p.matches} {i === game.currentPlayerIndex ? '· YOUR TURN' : '· waiting'}
          </span>
        </div>
      </div>
    {/each}

    {#if game.config.hintsEnabled && game.flippedIds.length === 1}
      <button class="hint-btn" on:click={() => { if (game) game = useHint(game); }}>💡 Hint</button>
    {/if}
  </div>

</div>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  WON                                                         -->
<!-- ═══════════════════════════════════════════════════════════ -->

{:else if screen === 'won' && game}
<div class="stage won-stage">
  <div class="blob b1" aria-hidden="true"></div>
  <div class="blob b2" aria-hidden="true"></div>
  <!-- Confetti burst: 40 colored squares fall from the top with randomized
       horizontal drift, rotation, and duration. Pure CSS — no deps. `--i`,
       `--x`, `--r`, `--d`, `--h` set per piece for natural variety. -->
  <div class="confetti" aria-hidden="true">
    {#each Array(40) as _, i}
      <span class="piece"
            style="--i:{i}; --x:{(i * 131) % 100}vw; --r:{(i * 53) % 360}deg; --d:{2 + ((i * 17) % 20) / 10}s; --h:{(i * 47) % 360}"></span>
    {/each}
  </div>
  <div class="won-card">
    <div class="won-logo">
      <svg class="sq-logo" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SocialQ">
        <circle cx="28" cy="28" r="27" stroke="white" stroke-width="2"/>
        <circle cx="20" cy="24" r="3.5" fill="white"/>
        <circle cx="36" cy="24" r="3.5" fill="white"/>
        <path d="M18 34 Q28 42 38 34" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    </div>

    <div class="won-emoji">🎉</div>
    {#if tie}
      <div class="won-headline">It's a Tie!</div>
    {:else if won}
      <div class="won-headline">{won.name} Wins!</div>
    {:else}
      <div class="won-headline">Game Over</div>
    {/if}

    <div class="won-stats">
      {#each game.players as p}
        <div class="stat-row">
          <span class="stat-name">{p.name}</span>
          <span class="stat-val gold">{p.matches} pair{p.matches !== 1 ? 's' : ''}</span>
        </div>
      {/each}
      <div class="stat-row muted">
        <span>Moves</span><span class="stat-val">{game.moveCount}</span>
      </div>
      <div class="stat-row muted">
        <span>Time</span><span class="stat-val">{elapsed}</span>
      </div>
    </div>

    <button class="cta-btn" on:click={() => startGame()}>Play Again</button>
    {#if game?.config.seed}
      <button class="share-btn" on:click={shareCurrentGame} aria-label="Challenge a friend with this deck">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="18" cy="5"  r="3"/>
          <circle cx="6"  cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59"  y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51"  x2="8.59"  y2="10.49"/>
        </svg>
        {shareCopied ? 'Link copied!' : 'Challenge a friend'}
      </button>
      <div class="seed-chip" title="Game seed — anyone with this code gets the same deck">seed: <code>{game.config.seed}</code></div>
    {/if}
    <button class="ghost-btn" on:click={goToLobby}>Change Mode</button>
    <button class="ghost-btn" on:click={exitToDashboard}>Back to Dashboard</button>
  </div>
</div>
{/if}

<style>
/* ── Reset / container ───────────────────────────────────────── */
.stage {
  position: fixed; inset: 0;
  display: flex; flex-direction: column; align-items: center;
  /* Let the global /web.png background (set on body in app.css) show through
     so /memory matches every other route. A very faint dark veil keeps the
     translucent white cards legible against the bright parts of the art. */
  background: rgba(10, 20, 40, .35);
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
  padding:
    env(safe-area-inset-top,   0px)
    env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom,0px)
    env(safe-area-inset-left,  0px);
  color: #fff;
}

/* ── Ambient blobs ───────────────────────────────────────────── */
/* Kept for subtle motion on top of /web.png but dimmed so they don't fight
   with the art. Increase the alpha below if you want more glow. */
.blob {
  position: fixed; border-radius: 50%;
  filter: blur(80px); pointer-events: none; z-index: 0;
  animation: blobDrift 12s ease-in-out infinite alternate;
}
.b1 { width: 500px; height: 500px; top: -120px; right: -80px;  background: rgba(99,102,241,.10); }
.b2 { width: 400px; height: 400px; bottom: -60px; left: -60px; background: rgba(236,72,153,.07); animation-delay: -6s; }
@keyframes blobDrift { 0%{transform:translate(0,0)} 100%{transform:translate(30px,20px)} }

/* ── SocialQ logo SVG ────────────────────────────────────────── */
.sq-logo    { width: 52px; height: 52px; filter: drop-shadow(0 2px 8px rgba(0,0,0,.4)); }
.sq-logo-sm { width: 30px; height: 30px; }

/* ═══════════════════ LOBBY ═══════════════════════════════════ */
.lobby-stage { justify-content: center; overflow-y: auto; }

/* Exit-to-dashboard pill in the top-left of the lobby and won screens.
   Matches the game's visual language (glass + white text) and sits ABOVE
   the ambient blobs so it's always clickable. */
.exit-btn {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  left: calc(env(safe-area-inset-left, 0px) + 16px);
  z-index: 10;
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px 8px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.1);
  border: 1.5px solid rgba(255,255,255,.2);
  color: #fff;
  font-size: .78rem; font-weight: 700;
  letter-spacing: .02em;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background .2s, transform .1s;
}
.exit-btn:hover { background: rgba(255,255,255,.2); }
.exit-btn:active { transform: scale(.97); }
.exit-btn svg { flex-shrink: 0; }

.lobby-wrap {
  position: relative; z-index: 1;
  width: min(540px, 96vw);
  display: flex; flex-direction: column; gap: 16px;
  padding: 20px 0 32px;
}

.hero-head {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; text-align: center;
}
.hero-title {
  display: flex; align-items: baseline; gap: 8px;
  filter: drop-shadow(0 3px 10px rgba(0,0,0,.5));
}
.ht-good  { font-size: clamp(2.2rem,9vw,4rem); font-weight:900; color:#FFD700; -webkit-text-stroke:2px #b8860b; }
.ht-with  { font-size: clamp(1rem,4vw,1.8rem); font-weight:700; color:#fff; font-style:italic; }
.ht-faces { font-size: clamp(2.2rem,9vw,4rem); font-weight:900; color:#FF69B4; -webkit-text-stroke:2px #c71585; }
.hero-sub { color: rgba(255,255,255,.6); font-size: .85rem; margin: 0; }
.hero-sub strong { color: rgba(255,255,255,.85); }

.lobby-card {
  background: rgba(255,255,255,.07);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 24px;
  padding: 24px 20px 20px;
  display: flex; flex-direction: column; gap: 10px;
}

.field-label {
  font-size: .7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: .1em; color: rgba(255,255,255,.55);
  margin-top: 6px;
}

.mode-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.mode-btn {
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(255,255,255,.1);
  border-radius: 14px; padding: 10px 8px;
  color: #fff; cursor: pointer; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  transition: all .2s;
}
.mode-btn.sel {
  background: rgba(255,215,0,.18);
  border-color: #FFD700;
  box-shadow: 0 0 14px rgba(255,215,0,.25);
}
.mode-grid-label { font-size: .65rem; color: rgba(255,255,255,.5); }
.mode-name       { font-size: .85rem; font-weight: 700; }
.mode-tag        { font-size: .6rem; color: rgba(255,255,255,.5); }

.mode-summary {
  /* Caption that previews what the selected difficulty plays like —
     replaces the old Card Art / Match Mode pickers. */
  margin: 10px 0 2px;
  font-size: .8rem;
  color: rgba(255,255,255,.72);
  text-align: center;
  font-style: italic;
  line-height: 1.4;
}

.deck-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  margin: 2px 0 0;
  border-radius: 999px;
  background: rgba(255,105,180,.1);
  border: 1px solid rgba(255,105,180,.35);
  font-size: .72rem; font-weight: 600;
  color: rgba(255,255,255,.85);
  align-self: flex-start;
}
.deck-chip code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: .7rem;
  color: #fff;
}
.deck-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #FF69B4;
  box-shadow: 0 0 8px #FF69B4;
}

.match-mode-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px;
}
.match-mode-btn {
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(255,255,255,.1);
  border-radius: 14px; padding: 10px 8px;
  color: #fff; cursor: pointer; text-align: center;
  display: flex; flex-direction: column; gap: 2px;
  transition: all .2s;
}
.match-mode-btn.sel {
  background: rgba(0,255,170,.14);
  border-color: #00FFAA;
  box-shadow: 0 0 14px rgba(0,255,170,.2);
}
.match-mode-label { font-size: .85rem; font-weight: 700; }
.match-mode-desc { font-size: .6rem; color: rgba(255,255,255,.5); }

.pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
.pill-btn {
  flex: 1; min-width: 80px;
  padding: 9px 12px;
  border-radius: 50px;
  background: rgba(255,255,255,.07);
  border: 1.5px solid rgba(255,255,255,.12);
  color: #fff; cursor: pointer; font-weight: 600; font-size: .85rem;
  transition: all .2s; text-align: center;
}
.pill-btn.sel {
  background: rgba(255,105,180,.22);
  border-color: #FF69B4;
  box-shadow: 0 0 12px rgba(255,105,180,.3);
}

.names-row { display: flex; align-items: center; gap: 8px; }
.name-in {
  flex: 1; padding: 9px 12px; border-radius: 12px;
  border: 1.5px solid rgba(255,255,255,.15);
  background: rgba(255,255,255,.08);
  color: #fff; font-size: .9rem;
}
.name-in::placeholder { color: rgba(255,255,255,.35); }
.vs-sep { color: rgba(255,255,255,.5); font-weight: 700; font-size: .8rem; }

.cta-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 6px; padding: 15px;
  background: linear-gradient(135deg, #FF8C00, #FF4500);
  border: none; border-radius: 50px; color: #fff;
  font-size: 1rem; font-weight: 900; letter-spacing: .04em;
  text-transform: uppercase; cursor: pointer; width: 100%;
  box-shadow: 0 4px 20px rgba(255,100,0,.45);
  transition: transform .15s, box-shadow .15s;
}
.cta-btn:hover  { transform: scale(1.02); box-shadow: 0 6px 26px rgba(255,100,0,.6); }
.cta-btn:active { transform: scale(.98); }

/* ═══════════════════ GAME ════════════════════════════════════ */
.game-stage { justify-content: flex-start; gap: 0; padding-top: 0; }

/* Top bar */
.topbar {
  width: 100%; display: flex; align-items: center;
  padding: 10px 12px 6px;
  gap: 8px; flex-shrink: 0;
  background: rgba(0,0,0,.2);
  backdrop-filter: blur(8px);
}
.back-btn, .home-btn {
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.15);
  color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background .2s;
  padding: 0;
}
.back-btn:hover, .home-btn:hover { background: rgba(255,255,255,.2); }
.topbar-brand { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.topbar-title { font-size: .85rem; white-space: nowrap; }
.tb-good  { color: #FFD700; font-weight: 900; }
.tb-with  { color: rgba(255,255,255,.7); font-style: italic; font-weight: 400; }
.tb-faces { color: #FF69B4; font-weight: 900; }
.topbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.ring { width: 36px; height: 36px; }
.clock {
  font-size: .85rem; font-weight: 700;
  background: rgba(0,0,0,.3); border-radius: 20px; padding: 4px 10px;
  color: rgba(255,255,255,.85);
}
.clock.urgent { color: #FF4444; animation: blink 1s ease-in-out infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }

/* Progress bar */
.prog-wrap {
  width: 100%; height: 4px;
  background: rgba(255,255,255,.1); flex-shrink: 0;
}
.prog-fill {
  height: 100%; background: linear-gradient(90deg,#FFD700,#FF8C00);
  transition: width .4s ease;
}

/* Board wrap — fills the vertical space between topbar and player-bar, centers the grid */
.board-wrap {
  flex: 1; width: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 4px 6px;
  min-height: 0; min-width: 0;
  overflow: hidden;
}

/* Board — width/height are computed in JS (computeBoardSize) to fit the wrap
   while maintaining the cols/rows aspect ratio. CSS aspect-ratio alone is
   unreliable inside an indeterminate flex parent (grid tracks collapse to 0). */
.board {
  display: grid;
  grid-template-columns: repeat(var(--cols, 4), 1fr);
  grid-template-rows: repeat(var(--rows, 4), 1fr);
  /* Zero gap so puzzle piece tabs (at the bounding-box edge) visually interlock
     with the adjacent card's notch — a positive gap would expose empty space
     between the pieces and break the jigsaw illusion. */
  gap: 0;
  /* Fallback size until JS sets inline width/height (first paint, no-JS). */
  width: min(100%, 960px);
  height: auto;
  aspect-ratio: calc(var(--cols) / var(--rows));
}

/* ── Card animation system ──────────────────────────────────────
 *
 * Five interlocking animations:
 *   1. deal-in    — cards fly from the dealer's hand (top-right) with
 *                   rotation, land with a slight overshoot. Staggered via
 *                   `--deal-delay` (30ms × board index).
 *   2. flip       — 3D rotateY, plus a lift (scale + shadow swell) so the
 *                   card feels like it's being picked up and turned.
 *   3. matched    — bounce-scale + green glow + particle-like pulse.
 *   4. mismatch   — horizontal shake (applied via .mismatch class).
 *   5. hint       — gentle breathing pulse on the partner card.
 *
 * Everything respects `prefers-reduced-motion` at the bottom. */

/* Each grid cell wraps the clipped .card PLUS an unclipped label overlay
   that renders on top after a match, so the emotion name isn't sliced off
   by the puzzle-piece tabs. */
.card-slot {
  position: relative;
  width: 100%; height: 100%;
  min-width: 0; min-height: 0;
}

.match-label {
  position: absolute;
  left: 50%; bottom: 8%;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--ec, #3B82F6);
  color: #fff;
  font-weight: 800;
  font-size: clamp(10px, 1.5vw, 14px);
  letter-spacing: .04em;
  text-transform: uppercase;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
  pointer-events: none;
  z-index: 5;
  animation: matchLabelIn 400ms cubic-bezier(.25, 1.3, .4, 1) both;
}
@keyframes matchLabelIn {
  from { opacity: 0; transform: translate(-50%, 6px) scale(.9); }
  to   { opacity: 1; transform: translate(-50%, 0)   scale(1); }
}

.card {
  border: none; background: transparent; padding: 0;
  cursor: pointer; min-width: 0; min-height: 0;
  height: 100%; width: 100%;
  border-radius: clamp(8px,1.5vw,14px);
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.35));
  transition: filter .25s cubic-bezier(.4,0,.2,1), transform .25s cubic-bezier(.4,0,.2,1);
  animation: dealIn 640ms cubic-bezier(.25, 1.4, .4, 1) var(--deal-delay, 0ms) both;
}
@keyframes dealIn {
  /* Start off-screen, top-right (dealer's hand), tilted. */
  0%   { opacity: 0; transform: translate(45vw, -55vh) rotate(22deg) scale(.55); }
  /* Mid-flight — fade in and rotate roughly upright. */
  55%  { opacity: 1; transform: translate(6vw, -4vh) rotate(6deg) scale(1.05); }
  /* Land with a soft overshoot from the cubic-bezier above. */
  100% { opacity: 1; transform: translate(0, 0) rotate(0) scale(1); }
}

/* Hover lift (only when interactive). */
.card:hover:not(:disabled) {
  filter: drop-shadow(0 6px 14px rgba(0,0,0,.55));
  transform: translateY(-2px);
}
.card:disabled { cursor: default; }

/* Matched: scale pop + sustained green glow ring. */
.card.matched {
  animation: matchPop 520ms cubic-bezier(.25, 1.4, .4, 1) both;
  filter: drop-shadow(0 0 10px rgba(34, 211, 158, .55)) drop-shadow(0 4px 10px rgba(0,0,0,.35));
}
@keyframes matchPop {
  0%   { transform: scale(1) rotate(0); }
  40%  { transform: scale(1.12) rotate(-2deg); }
  70%  { transform: scale(.97) rotate(1deg); }
  100% { transform: scale(1) rotate(0); }
}

/* Mismatch: short, sharp horizontal shake. Applied by the page logic
   when `lastMismatchIds` is populated — see the :class:mismatch binding. */
.card.mismatch {
  animation: mismatchShake 480ms cubic-bezier(.36, .07, .19, .97) both;
}
@keyframes mismatchShake {
  0%, 100% { transform: translateX(0); }
  10%      { transform: translateX(-6px) rotate(-1deg); }
  25%      { transform: translateX(5px)  rotate(1deg); }
  40%      { transform: translateX(-4px) rotate(-1deg); }
  55%      { transform: translateX(4px)  rotate(1deg); }
  70%      { transform: translateX(-2px); }
  85%      { transform: translateX(2px); }
}

/* Hint: soft breathing pulse — draws the eye without screaming. */
.card.hint {
  animation: hintBreath 1600ms ease-in-out infinite;
}
@keyframes hintBreath {
  0%, 100% {
    filter: drop-shadow(0 0 0 rgba(255, 215, 0, 0)) drop-shadow(0 4px 10px rgba(0,0,0,.35));
    transform: scale(1);
  }
  50% {
    filter: drop-shadow(0 0 14px rgba(255, 215, 0, .65)) drop-shadow(0 4px 10px rgba(0,0,0,.35));
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card.matched,
  .card.mismatch,
  .card.hint { animation: none; }
}

.card-inner {
  width: 100%; height: 100%; position: relative;
  transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.4,0,.2,1);
  border-radius: inherit;
}
.card.flipped .card-inner { transform: rotateY(180deg); }

.card-back, .card-front {
  position: absolute; inset: 0;
  border-radius: inherit;
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  overflow: hidden;
}

/* Card back — dark navy with SocialQ face watermark */
.card-back {
  background: linear-gradient(145deg, #1a3a7a, #0d2356);
  border: 2px solid rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
  gap: 4px;
}
.back-puzzle { width: 55%; height: 55%; opacity: .4; }
.back-q {
  font-size: clamp(1rem,5vw,2rem); font-weight: 900;
  color: rgba(255,255,255,.4); font-family: Georgia, serif;
}

/* Card front */
.card-front {
  transform: rotateY(180deg);
  background: #fff;
  border: 3px solid var(--ec, #3B82F6);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.8);
}

/* Face photo cards */
.face-img {
  width: 100%; height: 80%;
  /* `contain` preserves the whole face (no chin cropping). The card front
     is white so letterbox areas blend in. Previously `cover` with
     `object-position: center top` cropped the bottom quarter of every
     portrait. */
  object-fit: contain; object-position: center;
  display: block;
}
.face-fallback {
  width: 100%; height: 80%;
  align-items: center; justify-content: center;
}
.face-label {
  font-size: clamp(.5rem,1.6vw,.75rem); font-weight: 800;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--ec, #3B82F6);
  padding: 3px 0 4px;
  flex-shrink: 0;
}

/* Emoji cards */
.card-emoji {
  font-size: clamp(1.8rem, min(8vw,8vh), 4rem);
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,.1));
}
.emoji-label {
  font-size: clamp(.5rem,1.6vw,.7rem); font-weight: 800;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--ec, #3B82F6); margin-top: 2px;
}

/* Cartoon cards */
.cartoon-img { width: 82%; height: 75%; object-fit: contain; }

/* Transition (video) cards */
.transition-vid {
  width: 100%; height: 80%;
  object-fit: cover; object-position: center;
  display: block;
  background: #000;
}
.cartoon-fallback {
  width: 82%; height: 75%;
  align-items: center; justify-content: center;
}

/* Match glow */
.card.matched .card-inner {
  box-shadow: 0 0 0 3px #FFD700, 0 0 20px rgba(255,215,0,.5);
}
.card.matched { animation: pop .35s ease; }
@keyframes pop { 0%{transform:scale(1)} 45%{transform:scale(1.08)} 100%{transform:scale(1)} }

/* Hint glow */
.card.hint .card-inner { animation: hintPulse 1s ease-in-out infinite; }
@keyframes hintPulse {
  0%,100%{ box-shadow:0 0 0 3px #00FFAA,0 0 18px rgba(0,255,170,.55); }
  50%    { box-shadow:0 0 0 5px #00FFAA,0 0 34px rgba(0,255,170,.8);  }
}

/* Player bar */
.player-bar {
  width: 100%; flex-shrink: 0;
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px 8px;
  background: rgba(0,0,0,.25);
  backdrop-filter: blur(8px);
}
.player-chip {
  display: flex; align-items: center; gap: 8px;
  flex: 1; min-width: 0;
  padding: 7px 10px; border-radius: 14px;
  transition: all .3s;
  background: rgba(255,255,255,.06);
  border: 1.5px solid rgba(255,255,255,.08);
}
.player-chip.active {
  background: rgba(255,255,255,.14);
  border-color: rgba(255,255,255,.25);
  box-shadow: 0 0 16px rgba(255,255,255,.07);
}
.p-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg,#667eea,#764ba2);
  display: flex; align-items: center; justify-content: center;
  font-weight: 900; font-size: .85rem; color: #fff;
  border: 2px solid rgba(255,255,255,.25);
}
.p-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.p-name { font-size: .78rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-badge {
  font-size: .6rem; font-weight: 800; text-transform: uppercase;
  color: rgba(255,255,255,.5); letter-spacing: .04em;
}
.player-chip.active .p-badge { color: #22C55E; }

.hint-btn {
  background: rgba(0,255,170,.15); border: 1.5px solid #00FFAA;
  border-radius: 50px; color: #fff; padding: 7px 14px;
  font-weight: 700; font-size: .8rem; cursor: pointer; flex-shrink: 0;
  box-shadow: 0 0 12px rgba(0,255,170,.3);
}

/* ═══════════════════ WON ═════════════════════════════════════ */
.won-stage { justify-content: center; }

/* Confetti: a fixed-position layer of falling squares behind the won-card.
   Each `.piece` gets random horizontal start (`--x`), spin start (`--r`),
   duration (`--d`), and hue (`--h`). The `confettiFall` keyframes drop them
   from above the viewport down past the bottom while spinning. */
.confetti {
  position: fixed; inset: 0; pointer-events: none;
  z-index: 1; overflow: hidden;
}
.confetti .piece {
  position: absolute; top: -10vh;
  width: 10px; height: 14px;
  left: var(--x);
  background: hsl(var(--h, 200), 90%, 60%);
  transform: rotate(var(--r));
  animation: confettiFall var(--d, 3s) cubic-bezier(.4, .1, .6, 1) calc(var(--i, 0) * 40ms) both;
  border-radius: 2px;
}
@keyframes confettiFall {
  0%   { transform: translate(0, -10vh) rotate(var(--r)); opacity: 1; }
  100% { transform: translate(calc(sin(var(--r)) * 12vw), 110vh) rotate(calc(var(--r) + 720deg)); opacity: .6; }
}
@media (prefers-reduced-motion: reduce) {
  .confetti { display: none; }
}

.won-card {
  position: relative; z-index: 1;
  background: rgba(255,255,255,.09);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 28px;
  padding: 32px 28px;
  width: min(400px, 92vw);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  text-align: center;
}
.won-logo { display: flex; justify-content: center; }
.won-emoji { font-size: 3rem; }
.won-headline {
  font-size: clamp(1.6rem,6vw,2.2rem); font-weight: 900; color: #FFD700;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.5));
}
.won-stats {
  width: 100%; display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid rgba(255,255,255,.12); padding-top: 14px;
}
.stat-row {
  display: flex; justify-content: space-between; align-items: center;
  color: #fff; font-size: .95rem; font-weight: 600;
}
.stat-row.muted { color: rgba(255,255,255,.5); font-size: .85rem; font-weight: 400; }
.stat-val { font-weight: 700; }
.stat-val.gold { color: #FFD700; }
.ghost-btn {
  padding: 12px; width: 100%;
  background: rgba(255,255,255,.07);
  border: 1.5px solid rgba(255,255,255,.15);
  border-radius: 50px; color: rgba(255,255,255,.8);
  font-size: .9rem; font-weight: 600; cursor: pointer;
  transition: background .2s;
}
.ghost-btn:hover { background: rgba(255,255,255,.14); }

/* Challenge-a-friend button — uses the same pink accent as FACES in the logo,
   so it pops without competing with the gold "Play Again" CTA. */
.share-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 12px;
  background: rgba(255,105,180,.18);
  border: 1.5px solid #FF69B4;
  border-radius: 50px; color: #fff;
  font-size: .9rem; font-weight: 700; letter-spacing: .02em;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(255,105,180,.25);
  transition: background .2s, transform .1s;
}
.share-btn:hover { background: rgba(255,105,180,.28); }
.share-btn:active { transform: scale(.98); }

.seed-chip {
  font-size: .7rem; color: rgba(255,255,255,.55);
  letter-spacing: .04em;
}
.seed-chip code {
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  padding: 2px 8px; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(255,255,255,.85);
}

/* ═══════════════════ RESPONSIVE ═════════════════════════════ */
@media (min-width: 600px) {
  .mode-grid { grid-template-columns: repeat(5, 1fr); }
  .board { padding: 10px 16px; gap: clamp(6px,1vw,12px); }
  .topbar { padding: 12px 20px 8px; }
  .player-bar { padding: 8px 16px 10px; gap: 10px; }
  .sq-logo { width: 60px; height: 60px; }
  .ht-good, .ht-faces { -webkit-text-stroke: 3px; }
}

@media (min-width: 900px) {
  .board-wrap { padding: 12px 20px; }
  .board { gap: clamp(8px,1vw,14px); }
  .card-front { border-width: 4px; }
  .face-img { height: 82%; }
  .topbar-title { font-size: 1rem; }
}

/* When hosted inside the iOS WKWebView (MemoryGameWebView sets `document.body.classList.add('native')`)
   hide the web's own exit affordances — the native chrome provides them. Without this rule iOS
   shows TWO back buttons (iOS chevron + the web's Dashboard pill), which is confusing. */
:global(body.native) .exit-btn,
:global(body.native) .home-btn,
:global(body.native) .won-card .ghost-btn:last-of-type { /* the "Back to Dashboard" ghost button */
  display: none !important;
}

/* Respect users who prefer reduced motion — turn off flip, pop, hint pulse, blob drift,
   and the urgent-clock blink. The game still works; it just doesn't animate. */
@media (prefers-reduced-motion: reduce) {
  .card-inner,
  .prog-fill,
  .player-chip,
  .back-btn,
  .cta-btn,
  .ghost-btn,
  .mode-btn,
  .pill-btn { transition: none !important; }
  .card.matched,
  .card.hint .card-inner,
  .blob,
  .clock.urgent { animation: none !important; }
  .card.flipped .card-inner { transition: none !important; }
}
</style>
