<script lang="ts" context="module">
  /* This page uses browser-only APIs (video, performance, etc.).
     Disable SSR here to avoid 500s during server render. */
  export const ssr = false;
  export const csr = true;
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getUserKey } from '$lib/userKey';

  /* ---------------------------------------------------
   * Types & constants
   * --------------------------------------------------- */
  const EMOTIONS = ['Angry','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
  type Emotion = typeof EMOTIONS[number];
  type Clip = { media: string; from: Emotion; to: Emotion };

  // URL param -> level ('easy' | 'challenge')
  let level: 'Normal' | 'Challenge' = 'Normal';
  $: level = ($page.params.level === 'Challenge') ? 'Challenge' : 'Normal';

  // State
  let clips: Clip[] = [];
  let current = 0;
  let loading = true;
  let loadError = '';

  // UI gate: instructions must be dismissed before playing
  let instructionsOpen = true;

  // User picks
  let guessFrom: (Emotion | null)[] = [];
  let guessTo:   (Emotion | null)[] = [];

  // Per-question choices (three options each)
  let startChoices: Emotion[][] = [];
  let endChoices:   Emotion[][] = [];

  // Challenge timer (per question)
  const LIMIT = 10_000; // 10s
  let timeLeft = LIMIT;
  let timerId: number | null = null;

  // Overall quiz stopwatch (for history "time taken")
  let quizStartedAt: number | null = null;

  // Preconnect/preload helpers
  let firstOrigin: string | null = null;

  /* ---------------------------------------------------
   * Video helpers (replay/autoplay)
   * --------------------------------------------------- */
  let videoEl: HTMLVideoElement | null = null;
  function ensurePlays() { videoEl?.play().catch(() => {}); }
  function replay() {
    if (instructionsOpen || !videoEl) return;
    try { videoEl.pause(); videoEl.currentTime = 0; videoEl.play(); } catch {}
  }

  /* ---------------------------------------------------
   * Timer control
   * --------------------------------------------------- */
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function startTimer() {
    // only timed for "challenge" mode
    if (level !== 'challenge') { timeLeft = LIMIT; return; }
    stopTimer();
    timeLeft = LIMIT;
    timerId = window.setInterval(() => {
      timeLeft = Math.max(0, timeLeft - 100);
      if (timeLeft === 0) {
        stopTimer();
        next(true);
      }
    }, 100);
  }
  onDestroy(stopTimer);

  /* ---------------------------------------------------
   * Thumbnail capture AFTER the quiz (best-effort)
   * --------------------------------------------------- */
  function waitEvent<T extends keyof HTMLVideoElementEventMap>(v: HTMLVideoElement, name: T) {
    return new Promise<void>((res) => v.addEventListener(name, () => res(), { once: true }));
  }

  async function captureFromUrl(url: string): Promise<{ start?: string; end?: string }> {
    const v = document.createElement('video');
    Object.assign(v.style, { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.muted = true;
    (v as any).playsInline = true;
    v.src = url;
    document.body.appendChild(v);

    try {
      if (!Number.isFinite(v.duration) || !v.videoWidth) await waitEvent(v, 'loadedmetadata');
      if (v.readyState < 2) await waitEvent(v, 'canplay');

      const capFrame = async (t: number) => {
        const tt = Math.max(0, Math.min(v.duration || 0.1, t));
        v.currentTime = tt;
        await waitEvent(v, 'seeked');

        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return undefined;

        const cap = 128;
        const scale = Math.min(cap / w, cap / h);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d');
        if (!ctx) return undefined;

        try {
          ctx.drawImage(v, 0, 0, cw, ch);
          return c.toDataURL('image/jpeg', 0.72);
        } catch {
          return undefined; // CORS-tainted
        }
      };

      const start = await capFrame(0.05);
      const end   = await capFrame(Math.max(0.05, (v.duration || 0.1) - 0.08));
      return { start, end };
    } finally {
      try { v.pause(); } catch {}
      try { v.src = ''; } catch {}
      try { v.load?.(); } catch {}
      try { v.remove(); } catch {}
    }
  }

  async function captureBatch(urls: string[]) {
    const starts: (string | undefined)[] = [];
    const ends: (string | undefined)[] = [];
    for (const u of urls) {
      try {
        const { start, end } = await captureFromUrl(u);
        starts.push(start); ends.push(end);
      } catch {
        starts.push(undefined); ends.push(undefined);
      }
    }
    return { starts, ends };
  }

  /* ---------------------------------------------------
   * Choices & flow
   * --------------------------------------------------- */
  function makeChoices(correct: Emotion): Emotion[] {
    const pool = EMOTIONS.filter(e => e !== correct);
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks: Emotion[] = [correct, pool[0], pool[1]];
    // shuffle picks
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    return picks;
  }

  function chooseFrom(e: Emotion) { if (!instructionsOpen) guessFrom[current] = e; }
  function chooseTo(e: Emotion)   { if (!instructionsOpen) guessTo[current]   = e; }

  function next(auto = false) {
    if (!auto) {
      if (instructionsOpen) return;
      if (!guessFrom[current] || !guessTo[current]) {
        alert('Pick BOTH the starting and ending emotions.');
        return;
      }
    }
    if (current < clips.length - 1) { current += 1; startTimer(); }
    else { finish(); }
  }
  function back() { if (!instructionsOpen && current > 0) { current -= 1; startTimer(); } }

  function closeInstructions() {
    instructionsOpen = false;
    if (quizStartedAt == null) quizStartedAt = performance.now(); // start global stopwatch
    startTimer();
  }

  /* ---------------------------------------------------
   * Data load
   * --------------------------------------------------- */
  onMount(async () => {
    document.title = 'Transition Recognition';
    try {
      const res = await fetch('/transitions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const list = await res.json() as Array<{ href:string; from:Emotion; to:Emotion }>;
      clips = list.map(v => ({ media: v.href, from: v.from, to: v.to })).slice(0, 8);

      if (!clips.length) throw new Error('No transition videos found.');

      firstOrigin = new URL(clips[0].media, location.href).origin;

      guessFrom = Array(clips.length).fill(null);
      guessTo   = Array(clips.length).fill(null);
      startChoices = clips.map(c => makeChoices(c.from));
      endChoices   = clips.map(c => makeChoices(c.to));
      // timer starts after instructionsClose()
    } catch (e: any) {
      loadError = e?.message ?? 'Failed to load transitions.';
    } finally {
      loading = false;
    }
  });

  /* ---------------------------------------------------
   * Finish & persist
   * --------------------------------------------------- */
  async function finish() {
    stopTimer();

    // Picks (fallback to "__timeout__" if unanswered)
    const pickedFrom = clips.map((_, i) => (guessFrom[i] ?? '__timeout__'));
    const pickedTo   = clips.map((_, i) => (guessTo[i]   ?? '__timeout__'));

    // Score: a clip counts only if BOTH answers match
    let scoreNum = 0;
    const results: Array<[boolean, boolean]> = [];
    clips.forEach((c, i) => {
      const okFrom = pickedFrom[i] === c.from;
      const okTo   = pickedTo[i]   === c.to;
      if (okFrom && okTo) scoreNum++;
      results.push([okFrom, okTo]);
    });

    // Bare results for Results page
    localStorage.setItem('quiz_results', JSON.stringify(results));
    localStorage.setItem('quiz_score', String(scoreNum));
    localStorage.setItem('quiz_total', String(clips.length));

    // Thumbnails (best-effort)
    const { starts, ends } = await captureBatch(clips.map(c => c.media));

    // Rich details for Stats
    const rows = clips.map((c, i) => {
      const okFrom = results[i][0];
      const okTo   = results[i][1];
      const pStart = pickedFrom[i];
      const pEnd   = pickedTo[i];

      return {
        startImg: starts[i],
        endImg:   ends[i],
        from: c.from,
        to: c.to,
        pickedFrom: pStart,
        pickedTo:   pEnd,
        okFrom,
        okTo,
        correctStart: c.from,
        correctEnd:   c.to,
        pickedStart:  pStart,
        pickedEnd:    pEnd,
        isCorrect:    okFrom && okTo
      };
    });

    const userKey = getUserKey();
    localStorage.setItem('tr_details', JSON.stringify(rows));
    localStorage.setItem(`tr_details_${userKey}`, JSON.stringify(rows));

    // Save last run raw data (optional convenience)
    localStorage.setItem(
      `tr_last_run_${userKey}`,
      JSON.stringify({
        clips: clips.map(c => ({ href: c.media, from: c.from, to: c.to })),
        guessFrom, guessTo
      })
    );

    // record elapsed time into per-user history
    const endedAt   = performance.now();
    const elapsedMs = quizStartedAt != null ? Math.max(0, endedAt - quizStartedAt) : 0;
    const historyKey = `tr_history_${userKey}`;
    const attempt = { timeMs: elapsedMs, score: scoreNum, total: clips.length, level };
    const existing = JSON.parse(localStorage.getItem(historyKey) || '[]');
    existing.unshift(attempt);
    localStorage.setItem(historyKey, JSON.stringify(existing.slice(0, 50)));

    goto('/transition-recognition/results');
  }
</script>

<svelte:head>
  {#if firstOrigin}
    <link rel="preconnect" href={firstOrigin} />
  {/if}
  {#if clips[0]}
    <link rel="preload" as="video" href={clips[0].media} />
  {/if}
</svelte:head>

<style>
  @import '/static/style.css';
  :root{ --brand:#4f46e5; --brand2:#22d3ee; --ink:#0f172a; }

  .panel{
    width:min(980px,92vw);
    max-height:88vh;
    margin:4vh auto;
    padding:24px clamp(20px,4vw,36px);
    background:
      linear-gradient(180deg,rgba(255,255,255,.60),rgba(255,255,255,.48)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.10), transparent 60%);
    backdrop-filter: blur(18px);
    border-radius:28px;
    box-shadow:0 10px 40px rgba(0,0,0,.15);
    display:flex;
    flex-direction:column;
  }

  .progress-bar{
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(28px,1fr));
    gap:10px;
    align-items:center;
    margin:0 0 14px;
  }
  .dot{ height:6px; border-radius:4px; background:#d6d6d6; transition:background .2s, transform .2s; }
  .dot.active{ background:#4f46e5; transform:scale(1.05); }
  .dot.done{ background:#818cf8; }

  .title{
    font-size:2.1rem;
    margin:0 0 5px;
    font-family:'Georgia',serif;
    color:white;
    -webkit-text-stroke:2px rgba(0,0,0,.5);
    text-shadow:0 3px 3px rgba(0,0,0,.4);
  }

  .media-row{
    flex:1;
    display:grid;
    grid-template-columns:1fr auto;
    align-items:start;              /* keep timer aligned up */
    gap:16px;
    min-height:0;
    margin-bottom:18px;             /* NEW: breathing room below video */
  }
  .media-frame{
    justify-self:center;
    display:flex;
    align-items:center;
    justify-content:center;
    width:100%;
  }

  .clip{
    display:block;
    margin:0 auto;
    width:min(460px,86%);
    max-height:48vh;                /* NEW: slightly shorter so it never touches labels */
    object-fit:contain;
    border-radius:12px;
    border:6px solid #111;
    box-shadow:0 10px 30px rgba(0,0,0,.25);
    background:#000;
  }
  @media (max-height:920px){
    .clip{ max-height:45vh; }
  }

  .timer{
    align-self:start;
    min-width:72px;
    text-align:center;
    font-weight:800;
    font-size:1.1rem;
    color:#4f46e5;
    background:#fff;
    border:2px solid #4f46e5;
    border-radius:9999px;
    padding:8px 0;
  }

  .actions{
    margin-top:14px;
    padding-top:10px;
    border-top:1px solid rgba(0,0,0,.06);
    position:relative;              /* NEW */
    z-index:2;                      /* NEW: ensure on top if anything overlaps */
  }
  .group-label{ text-align:center; margin:6px 0 8px; font-weight:700; }

  .options.row3{
    display:grid;
    grid-template-columns:repeat(3, minmax(140px, 1fr));
    justify-items:center;
    gap:12px;
    margin-bottom:10px;
  }
  .pill{
    min-width:140px;
    padding:12px 16px;
    font-weight:700;
    font-size:16px;
    background:#fff;
    color:#4f46e5;
    border:2px solid #4f46e5;
    border-radius:9999px;
    cursor:pointer;
    transition:background .2s,color .2s,box-shadow .2s,border-color .2s;
  }
  .pill.selected, .pill:hover{
    background:#7c3aed; color:#fff; border-color:#7c3aed;
    box-shadow:0 6px 18px rgba(124,58,237,.28);
  }
  .pill[disabled]{ opacity:.6; cursor:not-allowed; }

  .nav-row{ display:flex; justify-content:center; gap:12px; margin-top:6px; }
  .btn{ padding:12px 20px; border-radius:9999px; font-weight:800; border:2px solid transparent; cursor:pointer; }
  .primary{ background:#4f46e5; color:#fff; border-color:#4f46e5; }
  .primary:hover{ filter:brightness(1.05); }
  .ghost{ background:#e5e7eb; color:#111827; border-color:#111827; }
  .ghost:hover{ background:#fff; }
  .btn[disabled]{ opacity:.6; cursor:not-allowed; }

  .modal-backdrop{
    position:fixed; inset:0;
    background:
      radial-gradient(60% 40% at 20% 10%, rgba(79,70,229,.28), transparent 60%),
      radial-gradient(50% 40% at 80% 30%, rgba(34,211,238,.24), transparent 60%),
      rgba(0,0,0,.45);
    display:grid; place-items:center; z-index:50; animation:fadeIn .18s ease;
  }
  .modal{
    width:min(640px,94vw);
    background:
      linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border:1px solid rgba(79,70,229,.28);
    border-radius:16px;
    box-shadow:0 24px 68px rgba(0,0,0,.35);
    padding:18px 18px 14px;
    text-align:left;
    color:var(--ink);
    animation:pop .18s ease;
  }
  .modal-header{ display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  .badge{
    width:34px; height:34px; border-radius:9999px;
    display:grid; place-items:center;
    background:linear-gradient(135deg, var(--brand), var(--brand2));
    box-shadow:0 10px 26px rgba(79,70,229,.28);
    color:#fff; font-size:18px;
  }
  .modal h3{ margin:0; font-size:1.25rem; }
  .modal-body{ color:#111; line-height:1.55; padding:6px 2px 0; }
  .modal-body ul{ margin:0; padding-left:18px; }
  .modal-body li{ margin:6px 0; }
  .modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
  .action{
    background:linear-gradient(135deg, var(--brand), var(--brand2));
    color:#fff; border:none; border-radius:10px;
    padding:10px 16px; cursor:pointer;
    box-shadow:0 10px 26px rgba(79,70,229,.28);
    transition:transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .action:hover{ filter:brightness(1.02); box-shadow:0 14px 32px rgba(79,70,229,.36); }
  .action:active{ transform:translateY(1px); }
</style>

<!-- Blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

{#if loading}
  <div class="panel">Loading…</div>
{:else if loadError}
  <div class="panel">Error: {loadError}</div>
{:else if clips[current]}
  <div class="panel" aria-disabled={instructionsOpen}>
    <div class="progress-bar">
      {#each clips as _, i}
        <div class="dot {i < current ? 'done' : i === current ? 'active' : ''}"></div>
      {/each}
    </div>

    <h1 class="title">Transition Recognition</h1>

    <div class="media-row">
      <div class="media-frame">
        <video
          bind:this={videoEl}
          key={clips[current].media}
          class="clip"
          src={clips[current].media}
          preload="auto"
          autoplay
          muted
          playsinline
          on:loadedmetadata={ensurePlays}
          on:canplay={ensurePlays}
        ></video>
      </div>

      {#if level === 'challenge'}
        <div class="timer" aria-live="polite">{Math.ceil(timeLeft/1000)}s</div>
      {/if}
    </div>

    <div class="actions">
      <div class="group-label">Starting emotion</div>
      <div class="options row3">
        {#each startChoices[current] as e}
          <button
            class="pill {guessFrom[current] === e ? 'selected' : ''}"
            disabled={instructionsOpen}
            on:click={() => chooseFrom(e)}
          >{e}</button>
        {/each}
      </div>

      <div class="group-label">Ending emotion</div>
      <div class="options row3">
        {#each endChoices[current] as e}
          <button
            class="pill {guessTo[current] === e ? 'selected' : ''}"
            disabled={instructionsOpen}
            on:click={() => chooseTo(e)}
          >{e}</button>
        {/each}
      </div>

      <div class="nav-row">
        <button class="btn ghost" on:click={replay} disabled={instructionsOpen}>Replay</button>
        <button class="btn ghost" on:click={back} disabled={current === 0 || instructionsOpen}>Back</button>
        <button class="btn primary" on:click={() => next(false)} disabled={instructionsOpen}>Next</button>
      </div>
    </div>

    <!-- Hidden preloader -->
    <div aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;">
      {#each [current + 1, current + 2].filter(i => i < clips.length) as i}
        <video src={clips[i].media} preload="auto" muted playsinline />
      {/each}
    </div>
  </div>

  {#if instructionsOpen}
    <div class="modal-backdrop" on:click={closeInstructions}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="How to play" on:click|stopPropagation>
        <div class="modal-header">
          <div class="badge">🎬</div>
          <h3>How to play</h3>
        </div>
        <div class="modal-body">
          <ul>
            <li>Watch the short clip showing a <strong>transition between two emotions</strong>.</li>
            <li>Select the <strong>starting</strong> emotion and the <strong>ending</strong> emotion.</li>
            <li>Choose <em>challenge</em> for a timer, or <em>normal</em> for a relaxed pace.</li>
          </ul>
        </div>
        <div class="modal-actions">
          <button class="action" type="button" on:click={closeInstructions}>Got it</button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <div class="panel">No clips available.</div>
{/if}
