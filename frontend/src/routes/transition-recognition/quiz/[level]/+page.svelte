<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getUserKey } from '$lib/userKey';

  const EMOTIONS = ['Angry','Disgust','Fear','Happy','Neutral','Sad','Surprise'] as const;
  type Emotion = typeof EMOTIONS[number];
  type Clip = { media: string; from: Emotion; to: Emotion };

  let level: 'easy' | 'challenge' = 'easy';
  let clips: Clip[] = [];
  let current = 0;

  // read the [level] param from the URL (easy|challenge)
  $: level = ($page.params.level === 'challenge') ? 'challenge' : 'easy';

  let loading = true;
  let loadError = '';

  // user selections
  let guessFrom: (Emotion | null)[] = [];
  let guessTo:   (Emotion | null)[] = [];

  // three choices per question
  let startChoices: Emotion[][] = [];
  let endChoices:   Emotion[][] = [];

  // challenge timer
  const LIMIT = 10_000;
  let timeLeft = LIMIT;
  let timerId: number | null = null;

  // ---------- thumbnail capture (off-screen, AFTER the quiz) ----------
  function waitEvent<T extends keyof HTMLVideoElementEventMap>(v: HTMLVideoElement, name: T) {
    return new Promise<void>((res) => v.addEventListener(name, () => res(), { once: true }));
  }

  async function captureFromUrl(url: string): Promise<{ start?: string; end?: string }> {
    // keep the video in DOM (hidden) for best WebKit compatibility
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
  // --------------------------------------------------------------------

  // preconnect + first-clip preload (set after fetch)
  let firstOrigin: string | null = null;

  function startTimer() {
    if (level !== 'challenge') return;
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
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function next(auto = false) {
    if (!auto) {
      if (!guessFrom[current] || !guessTo[current]) {
        alert('Pick BOTH the starting and ending emotions.');
        return;
      }
    }
    if (current < clips.length - 1) { current += 1; startTimer(); }
    else { finish(); }
  }
  function back() { if (current > 0) { current -= 1; startTimer(); } }

  let videoEl: HTMLVideoElement | null = null;
  function ensurePlays() { videoEl?.play().catch(() => {}); }
  function replay() {
    if (!videoEl) return;
    try { videoEl.pause(); videoEl.currentTime = 0; videoEl.play(); } catch {}
  }

  async function finish() {
    stopTimer();

    const pickedFrom = clips.map((_, i) => (guessFrom[i] ?? '__timeout__'));
    const pickedTo   = clips.map((_, i) => (guessTo[i]   ?? '__timeout__'));

    let scoreNum = 0;
    const results: Array<[boolean, boolean]> = [];

    clips.forEach((c, i) => {
      const okFrom = pickedFrom[i] === c.from;
      const okTo   = pickedTo[i]   === c.to;
      if (okFrom && okTo) scoreNum++;
      results.push([okFrom, okTo]);
    });

    // Used by /results
    localStorage.setItem('quiz_results', JSON.stringify(results));
    localStorage.setItem('quiz_score', String(scoreNum));
    localStorage.setItem('quiz_total', String(clips.length));

    // Thumbnails for stats (captured off-screen AFTER quiz)
    const { starts, ends } = await captureBatch(clips.map(c => c.media));

    const rows = clips.map((c, i) => {
      const okFrom = results[i][0];
      const okTo   = results[i][1];
      const pStart = pickedFrom[i];
      const pEnd   = pickedTo[i];

      return {
        // thumbs
        startImg: starts[i],
        endImg:   ends[i],

        // legacy names your stats page reads
        from: c.from,
        to: c.to,
        pickedFrom: pStart,
        pickedTo:   pEnd,
        okFrom,
        okTo,

        // unified names if you ever switch
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

    localStorage.setItem(
      `tr_last_run_${userKey}`,
      JSON.stringify({
        clips: clips.map(c => ({ href: c.media, from: c.from, to: c.to })),
        guessFrom, guessTo
      })
    );

    goto('/transition-recognition/results');
  }

  function makeChoices(correct: Emotion): Emotion[] {
    const pool = EMOTIONS.filter(e => e !== correct);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks: Emotion[] = [correct, pool[0], pool[1]];
    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picks[i], picks[j]] = [picks[j], picks[i]];
    }
    return picks;
  }

  onMount(async () => {
    document.title = 'Transition Recognition';

    try {
      const res = await fetch('/transitions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const list = await res.json() as Array<{ href:string; from:Emotion; to:Emotion }>;
      clips = list.map(v => ({ media: v.href, from: v.from, to: v.to })).slice(0, 8);

      if (!clips.length) throw new Error('No transition videos found.');

      // host hints for faster first paint
      firstOrigin = new URL(clips[0].media, location.href).origin;

      guessFrom = Array(clips.length).fill(null);
      guessTo   = Array(clips.length).fill(null);
      startChoices = clips.map(c => makeChoices(c.from));
      endChoices   = clips.map(c => makeChoices(c.to));

      startTimer();
    } catch (e: any) {
      loadError = e?.message ?? 'Failed to load transitions.';
    } finally {
      loading = false;
    }
  });

  onDestroy(stopTimer);

  function chooseFrom(e: Emotion) { guessFrom[current] = e; }
  function chooseTo(e: Emotion)   { guessTo[current]   = e; }
</script>

<svelte:head>
  {#if firstOrigin}
    <!-- Help the browser connect to the video host ASAP -->
    <link rel="preconnect" href={firstOrigin} />
  {/if}
  {#if clips[0]}
    <!-- Hint the first clip so it starts buffering immediately -->
    <link rel="preload" as="video" href={clips[0].media} />
  {/if}
</svelte:head>

<style>
  @import '/static/style.css';

  .panel{
    width: min(980px, 92vw);
    max-height: 88vh;
    margin: 4vh auto;
    padding: 24px clamp(20px, 4vw, 36px);
    background: rgba(255,255,255,0.6);
    backdrop-filter: blur(18px);
    border-radius: 28px;
    box-shadow: 0 10px 40px rgba(0,0,0,.15);
    display: flex;
    flex-direction: column;
  }
  .progress-bar{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(28px, 1fr));
    gap: 10px;
    align-items: center;
    margin: 0 0 14px;
  }
  .dot{
    height: 6px;
    border-radius: 4px;
    background: #d6d6d6;
    transition: background .2s, transform .2s;
  }
  .dot.active{ background:#4f46e5; transform: scale(1.05); }
  .dot.done{ background:#818cf8; }

  .title {
    font-size: 2.1rem;
    margin-bottom:5px;
    margin-top: 0px;
    font-family: 'Georgia', serif;
    color: white;
    -webkit-text-stroke: 2px rgba(0,0,0,0.5);
    text-shadow: 0 3px 3px rgba(0,0,0,0.4);
  }

  .media-row{
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 16px;
    min-height: 0;
  }
  .media-frame{
    justify-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .clip{
    display: block;
    margin: 0 auto;
    width: min(460px, 86%);
    max-height: 54.5vh;
    object-fit: contain;
    border-radius: 12px;
    border: 6px solid #111;
    box-shadow: 0 10px 30px rgba(0,0,0,.25);
    background: #000;
  }

  @media (max-height: 920px){
    .clip{ max-height: 45vh; }
  }
  .timer{
    align-self: start;
    min-width: 72px;
    text-align: center;
    font-weight: 800;
    font-size: 1.1rem;
    color: #4f46e5;
    background: #fff;
    border: 2px solid #4f46e5;
    border-radius: 9999px;
    padding: 8px 0;
  }

  .actions{ margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,.06); }
  .group-label{ text-align:center; margin:6px 0 8px; font-weight:700; }

  .options.row3{
    display: grid;
    grid-template-columns: repeat(3, minmax(140px, 1fr));
    justify-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .pill{
    min-width: 140px;
    padding: 12px 16px;
    font-weight: 700;
    font-size: 16px;
    background:#fff;
    color:#4f46e5;
    border:2px solid #4f46e5;
    border-radius:9999px;
    cursor:pointer;
    transition:background .2s,color .2s,box-shadow .2s,border-color .2s;
  }
  .pill.selected, .pill:hover{
    background:#7c3aed; color:#fff; border-color:#7c3aed; box-shadow:0 6px 18px rgba(124,58,237,.28);
  }

  .nav-row{ display:flex; justify-content:center; gap:12px; margin-top:6px; }
  .btn{ padding: 12px 20px; border-radius: 9999px; font-weight: 800; border: 2px solid transparent; cursor: pointer; }
  .primary{ background:#4f46e5; color:#fff; border-color:#4f46e5; }
  .primary:hover{ filter: brightness(1.05); }
  .ghost{ background:#e5e7eb; color:#111827; border-color:#111827; }
  .ghost:hover{ background:#fff; }
</style>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

{#if loading}
  <div class="panel">Loading…</div>
{:else if loadError}
  <div class="panel">Error: {loadError}</div>
{:else if clips[current]}
  <div class="panel">
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
          <button class="pill {guessFrom[current] === e ? 'selected' : ''}" on:click={() => chooseFrom(e)}>{e}</button>
        {/each}
      </div>

      <div class="group-label">Ending emotion</div>
      <div class="options row3">
        {#each endChoices[current] as e}
          <button class="pill {guessTo[current] === e ? 'selected' : ''}" on:click={() => chooseTo(e)}>{e}</button>
        {/each}
      </div>

      <div class="nav-row">
        <button class="btn ghost" on:click={replay}>Replay</button>
        <button class="btn ghost" on:click={back} disabled={current === 0}>Back</button>
        <button class="btn primary" on:click={() => next(false)}>Next</button>
      </div>
    </div>

    <!-- Hidden preloader: warms up the next 1–2 clips so “Next” feels instant -->
    <div aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden;">
      {#each [current + 1, current + 2].filter(i => i < clips.length) as i}
        <video src={clips[i].media} preload="auto" muted playsinline />
      {/each}
    </div>
  </div>
{/if}
