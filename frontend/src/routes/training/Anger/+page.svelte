<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import helperUrl from '$lib/assets/helper.png';           // still used in the top banners
  import angerClip from '$lib/assets/ekman/AngerPractice.mp4';

  // ------- page config -------
  const EMOTION = 'Anger';
  const QUOTE = '“Speak when you are angry and you will make the best speech you will ever regret.”';
  const QUOTE_ATTR = '— Ambrose Bierce';


  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let human: any;
  let showOverlay = true;
  let lastResult: any = null;
  let coachOpen = true;
  let coachStep = 0;

  // Tweak these per page if you want different copy:
  let coachSteps: string[] = [
    'Welcome! On the left is your live camera. On the right is a transition from a neutral face to one of the emotion to practice.',
    'Try to mirror the expression. Use the on-screen controls/tips to guide you.',
    'Click “Start” to begin practicing. You can replay or switch examples anytime.'
  ];

  // Show once per route (based on URL path). Set to false to always show.
  const SHOW_ONCE = true;

  // >>> CHANGE: versioned key + ?coach override <<<
  const COACH_VER = 'v2';
  const COACH_KEY =
    typeof window !== 'undefined' ? `coach_seen:${location.pathname}:${COACH_VER}` : 'coach_seen';

  onMount(() => {
    // Allow forcing the coach to show via ?coach
    const force = typeof window !== 'undefined' && new URLSearchParams(location.search).has('coach');
    if (force) {
      coachOpen = true;
      return;
    }
    try {
      if (SHOW_ONCE && localStorage.getItem(COACH_KEY) === '1') coachOpen = false;
    } catch {}
  });

  function advanceCoach() {
    if (coachStep < coachSteps.length - 1) {
      coachStep += 1;
    } else {
      coachOpen = false;
      try { if (SHOW_ONCE) localStorage.setItem(COACH_KEY, '1'); } catch {}
    }
  }

  // right-side practice clip
  let clipEl: HTMLVideoElement | null = null;
  function replayClip() {
    if (!clipEl) return;
    try { clipEl.pause(); clipEl.currentTime = 0; clipEl.play(); } catch {}
  }

  // ------- helper chips (no icons on the right now) -------
  type TipKey = 'brows' | 'eyes' | 'mouth';
  let openTip: TipKey | null = null;   // clicked state
  let hoverTip: TipKey | null = null;  // hover-only state for generic banner

  const tips: Array<{
    key: TipKey;
    title: string;
    text: string;
    x: string; // percentage within image frame
    y: string; // percentage within image frame
    label: string;
  }> = [
    { key: 'brows', title: 'Brows', text: 'Inner brows pulled down and together.', x: '94%', y: '41%', label: 'Brows' },
    { key: 'eyes',  title: 'Eyes',  text: 'Upper lids tense; hard, focused stare.',   x: '94%', y: '45%', label: 'Eyes'  },
    { key: 'mouth', title: 'Mouth', text: 'Lips pressed together or tightened.',     x: '94%', y: '67%', label: 'Mouth' }
  ];

  // expose the currently open tip (for the top panel)
  $: activeTip = (openTip ? tips.find(t => t.key === openTip) : null) ?? null;

  // spotlight strip position (centered on the open tip)
  $: activeY = activeTip ? activeTip.y : null;

  function toggleTip(k: TipKey) {
    openTip = openTip === k ? null : k;
  }

  // ------- nav -------
  function goBackToPicker() { goto('/training/training-pick-emotion'); }
  function goDashboard() { goto('/dashboard'); }

  // ------- mount: webcam + Human -------
  onMount(async () => {
    // 1) load Human.js
    await new Promise<void>((res, rej) => {
      // @ts-ignore
      if ((window as any).Human) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.append(s);
    });

    // 2) webcam
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
    await video.play();

    // 3) canvas
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx = canvas.getContext('2d')!;

    // 4) Human init
    // @ts-ignore
    human = new (window as any).Human.Human({
      backend: 'webgl',
      modelBasePath: 'https://vladmandic.github.io/human/models',
      face: {
        enabled: true,
        detector: { enabled: true, maxFaces: 1 },
        mesh: { enabled: true },
        iris: { enabled: true },
        description: { enabled: true },
        emotion: { enabled: true }
      },
      body: false, hand: false, object: false, gesture: false
    });
    await human.load();
    await human.warmup();

    // 5) draw loop
    (async function drawLoop() {
      try { lastResult = await human.detect(video); } catch {}
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (showOverlay && lastResult) {
        try { human.draw.all(canvas, lastResult); } catch {}
      }
      requestAnimationFrame(drawLoop);
    })();

    // 6) ensure the practice clip tries to play
    try { clipEl?.play(); } catch {}
  });
</script>

<svelte:head>
  <title>Mirroring Practice – {EMOTION}</title>
</svelte:head>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<header class="header"><h1>Mirroring Practice</h1></header>

<div class="container">
  <!-- LEFT: live camera -->
  <section class="pane left">
    <video bind:this={video} autoplay playsinline muted style="display:none;"></video>
    <canvas bind:this={canvas} class="cam-canvas" aria-label="Camera feed"></canvas>

    <div class="left-controls">
      <button class="chip" on:click={() => (showOverlay = !showOverlay)}>{showOverlay ? 'Hide overlay' : 'Show overlay'}</button>
      <button class="chip" on:click={goDashboard}>Back to Dashboard</button>
      <button class="chip" on:click={goBackToPicker}>Switch Emotion</button>
    </div>
  </section>

  {#if coachOpen}
    <div class="coach-backdrop" role="dialog" aria-modal="true" aria-label="Getting started">
      <div class="coach">
        <img class="coach-avatar" src={helperUrl} alt="Helper" />
        <button class="coach-card" on:click={advanceCoach} aria-live="polite">
          <div class="coach-text">{coachSteps[coachStep]}</div>
          <div class="coach-footer">
            <div class="coach-dots">
              {#each coachSteps as _, i}
                <span class="dot {i === coachStep ? 'active' : ''}"></span>
              {/each}
            </div>
            <span class="coach-next">{coachStep < coachSteps.length - 1 ? 'Next' : 'Start'}</span>
          </div>
        </button>
      </div>
    </div>
  {/if}

  <!-- RIGHT: practice transition clip -->
  <section class="pane right">
    <div class="clip-frame">
      <video
        bind:this={clipEl}
        class="clip"
        src={angerClip}
        preload="auto"
        autoplay
        playsinline
        muted
        on:loadedmetadata={() => clipEl?.play().catch(()=>{})}
        on:canplay={() => clipEl?.play().catch(()=>{})}
      ></video>

      <button class="replay" type="button" on:click={replayClip}>Replay</button>
    </div>

    <!-- helper CHIPS only (icons removed) -->
    <div class="tip-helpers">
      {#each tips as t}
        <div class="chip-tip" style={"--x:"+t.x+"; --y:"+t.y}>
          <button
            class="name-chip"
            on:mouseenter={() => (hoverTip = t.key)}
            on:mouseleave={() => (hoverTip = null)}
            on:click={() => toggleTip(t.key)}
            aria-expanded={openTip === t.key}
          >
            {t.label}
          </button>
        </div>
      {/each}
    </div>

    <!-- GENERIC: top banner while hovering any chip (and none is open)
         NOTE: background is WHITE for hover, per request -->
    {#if hoverTip && !openTip}
      <div class="hover-panel">
        <img class="hover-avatar" src={helperUrl} alt="" />
        <div class="hover-card hover-white">
          <div class="hover-title">How to use these</div>
          <div class="hover-text">Click a helper (Brows, Eyes, or Mouth) to open the tip for that area.</div>
        </div>
      </div>
    {/if}

    <!-- CLICKED: specific instruction (kept YELLOW) -->
    {#if activeTip}
      <div class="top-tip">
        <img class="hover-avatar" src={helperUrl} alt="" />
        <div class="hover-card">
          <div class="hover-title">{activeTip.title}</div>
          <div class="hover-text">– {activeTip.text}</div>
        </div>
      </div>
    {/if}
  </section>

  <!-- spotlight strip across BOTH panes while a tip is open -->
  {#if activeY}
    <div class="strip-mask" style={"--hole-y:"+activeY+"; --half:40px"}></div>
  {/if}

  <!-- Quote attached to bottom of the card -->
  <footer class="quote-bar">
    <div class="quote-inner">
      <em class="quote">{QUOTE}</em>
      <span class="attr">{QUOTE_ATTR}</span>
    </div>
  </footer>
</div>

<style>
  @import '/static/style.css';

  :global(body){ margin:0; overflow:hidden; font-family:Arial, sans-serif; background:#fdfcfc; }

  .header{
    position:absolute; top:0; left:0; right:0; z-index:5;
    display:flex; justify-content:center; align-items:center;
    padding:12px 20px;
  }
  .header h1{
    margin:0; color:#fff; font-family:Georgia, serif; font-size:3.2rem;
    text-shadow:0 3px 8px rgba(0,0,0,.6);
  }

  /* Card */
  .container{
    --gutter-left: clamp(260px, 6vw, 120px);
    --gutter-right: clamp(200px, 16vw, 300px); /* room for chips */
    --gutter-top: clamp(80px, 10vh, 110px);
    --gutter-bottom: clamp(36px, 7vh, 60px);
    --quote-space: 86px;

    position:absolute; inset: var(--gutter-top) var(--gutter-right) var(--gutter-bottom) var(--gutter-left);
    display:grid; grid-template-columns: 1fr 1fr;
    background:
      linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.22)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.12), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.12), transparent 60%);
    backdrop-filter: blur(20px);
    border:1px solid rgba(255,255,255,.6);
    border-radius:16px;
    box-shadow:0 8px 40px rgba(0,0,0,.45);
    overflow:hidden;
  }

  .pane{ position:relative; display:grid; place-items:center; overflow:visible; }

  /* LEFT (webcam) */
  .left{ background: rgba(0,0,0,.12); }
  .cam-canvas{
    position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
    border-right:1px solid rgba(0,0,0,.08);
  }
  .left-controls{
    position:absolute;
    left:14px;
    bottom: calc(12px + var(--quote-space));
    display:flex; gap:10px; z-index:20;
  }

  .chip{
    background:#fff; border:2px solid #111; border-radius:9999px;
    padding:8px 16px; font-weight:800; cursor:pointer;
    box-shadow:0 8px 18px rgba(0,0,0,.16);
  }

  /* RIGHT (practice clip) */
  .right{ background:transparent; }
  .clip-frame{
    position:absolute; inset: 16px 16px calc(16px + var(--quote-space)) 16px;
    border: 2px solid #111; border-radius:14px; background: transparent;
    box-shadow:0 12px 30px rgba(0,0,0,.22);
    overflow:hidden;
  }
  .clip{
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:contain;
    background: transparent;
  }
  .replay{
    position:absolute; left:50%; bottom:8px; transform:translateX(-50%);
    border-radius:9999px; border:2px solid #111;
    background:#fff; padding:6px 14px; font-weight:800; cursor:pointer;
    box-shadow:0 8px 18px rgba(0,0,0,.16);
  }

  /* helper chips area */
  .tip-helpers{
    position:absolute; inset:16px 16px calc(16px + var(--quote-space)) 16px;
    pointer-events:none; z-index:12;
  }
  .chip-tip{
    position:absolute; top:var(--y); left:var(--x); transform:translate(-50%,-50%);
  }
  .name-chip{
    pointer-events:auto;
    position:relative;
    transform: translate(8px, -50%); /* nudge slightly right of the anchor */
    background:#fff;
    border:2px solid #111;
    border-radius:9999px;
    padding:6px 12px;
    font-weight:800; font-size:.92rem; white-space:nowrap;
    cursor:pointer;
    box-shadow:0 8px 18px rgba(0,0,0,.16);
  }

  /* top banners */
  .hover-panel,
  .top-tip{
    position:absolute; top:10px; left:50%; transform:translateX(-50%);
    display:flex; align-items:center; gap:10px; z-index:96; pointer-events:none;
  }
  .hover-avatar{ width:56px; height:56px; object-fit:contain; filter:drop-shadow(0 10px 26px rgba(0,0,0,.35)); }
  .hover-card{
    background:#fde047; color:#0f172a; border:2px solid #111; border-radius:14px;
    padding:10px 14px; box-shadow:0 14px 34px rgba(234,179,8,.35);
    max-width: min(720px, 70vw);
  }
  /* hover banner becomes WHITE as requested */
  .hover-white{ background:#fff; box-shadow:0 14px 34px rgba(0,0,0,.18); }
  .hover-title{ font-weight:800; margin-bottom:2px; }
  .hover-text{ line-height:1.4; }

  /* spotlight strip that dims everything except ±var(--half) around --hole-y */
  .strip-mask{
    position:absolute; inset:0; z-index:60; pointer-events:none; border-radius:16px;
  }
  .strip-mask::before, .strip-mask::after{
    content:''; position:absolute; left:0; right:0;
    background: rgba(255,255,255,.78);
    backdrop-filter: blur(2px);
  }
  .strip-mask::before{
    top:0; height: calc((var(--hole-y)) - var(--half));
    border-top-left-radius:16px; border-top-right-radius:16px;
  }
  .strip-mask::after{
    top: calc((var(--hole-y)) + var(--half)); bottom: 0;
    border-bottom-left-radius:16px; border-bottom-right-radius:16px;
  }

  /* quote inside card */
  .quote-bar{
    position:absolute; left:0; right:0; bottom:0; height: var(--quote-space);
    display:flex; align-items:center; justify-content:center; z-index:40;
    background: linear-gradient(0deg, rgba(255,255,255,.72), rgba(255,255,255,.42));
    backdrop-filter: blur(8px);
    border-bottom-left-radius:16px; border-bottom-right-radius:16px;
    box-shadow: 0 -6px 20px rgba(0,0,0,.18) inset;
    padding: 0 18px;
  }
  .quote-inner{ color:#0f172a; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; justify-content:center; text-align:center; width:100%; }
  .quote{ font-size:1.02rem; }
  .attr{ font-weight:700; margin-left:6px; }

  /* --- Coach overlay styles (safe to reuse across pages) --- */
  .coach-backdrop{
    position: fixed; inset: 0; z-index: 1000;
    background:
      radial-gradient(60% 40% at 20% 10%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(50% 40% at 80% 30%, rgba(34,211,238,.16), transparent 60%),
      rgba(0,0,0,.45);
    display: grid; place-items: center;
    animation: coachFadeIn .18s ease both;
  }
  .coach{
    display: grid; grid-auto-flow: column; align-items: center; gap: 14px; padding: 10px;
    background: rgba(255,255,255,.15);
    border: 1px solid rgba(255,255,255,.3);
    border-radius: 16px; backdrop-filter: blur(14px);
    box-shadow: 0 24px 68px rgba(0,0,0,.35);
  }
  .coach-avatar{
    width: 108px; height: 108px; object-fit: contain; user-select: none;
    filter: drop-shadow(0 10px 26px rgba(0,0,0,.35));
  }
  .coach-card{
    min-width: min(560px, 86vw);
    border: none; cursor: pointer; text-align: left;
    background: #fde047; color: #0f172a;
    border-radius: 14px; padding: 14px 16px 12px;
    box-shadow: 0 14px 34px rgba(234,179,8,.35);
  }
  .coach-card:focus{ outline: 3px solid rgba(79,70,229,.45); }
  .coach-text{ font-size: 1.05rem; line-height: 1.45; }
  .coach-footer{
    margin-top: 10px; display: flex; justify-content: space-between; align-items: center;
    font-weight: 800;
  }
  .coach-next{ background: rgba(0,0,0,.12); padding: 6px 10px; border-radius: 9999px; }
  .coach-dots{ display: flex; gap: 6px; }
  .coach-dots .dot{
    width: 8px; height: 8px; border-radius: 9999px; background: rgba(0,0,0,.25);
  }
  .coach-dots .dot.active{ background: #111; }

  @keyframes coachFadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
