<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // ---------- DOM refs ----------
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let countdown: HTMLDivElement;
  let bar: HTMLDivElement;
  let ctx: CanvasRenderingContext2D;
  let human: any;

  // ---------- state ----------
  let currentIndex = 0;
  let showOverlay = true;
  let evaluating = false;          // lock while countdown or eval runs
  let lastResult: any = null;

  // instructions modal
  let instructionsOpen = true;

  // targets returned by your /ekman endpoint
  type Target = { img: string; label?: string; difficulty?: string; correct?: string; emotion?: string; name?: string; answer?: string };
  let difficulty = '1';
  let targets: Target[] = [];

  // scoring
  let results: boolean[] = [];
  let score = 0;

  // ---------- helpers: emotions ----------
  const EMO_MAP: Record<string, string> = {
    happy: 'happy',
    happiness: 'happy',
    angry: 'angry',
    anger: 'angry',
    disgust: 'disgust',
    fear: 'fear',
    sad: 'sad',
    sadness: 'sad',
    surprise: 'surprise',
    surprised: 'surprise',
    neutral: 'neutral'
  };
  function normEmotion(s?: string | null) {
    const k = (s || '').toLowerCase().trim();
    return EMO_MAP[k] ?? k;
  }
  function topEmotionFrom(result: any): string | null {
    const face = result?.face?.[0];
    const arr = Array.isArray(face?.emotion) ? face.emotion : [];
    if (!arr.length) return null;
    const best = arr.reduce((a: any, b: any) => (b.score > a.score ? b : a), arr[0]);
    return normEmotion(best?.emotion);
  }

  onMount(async () => {
    // 1) load targets
    try {
      const res = await fetch(`/ekman?difficulty=${encodeURIComponent(difficulty)}&count=12`, { cache: 'no-store' });
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('No images');
      targets = rows;
    } catch (e) {
      console.error('Failed to load ekman targets:', e);
      targets = [
        { img: '/target1.png', label: 'happy' },
        { img: '/target2.png', label: 'angry' },
        { img: '/target3.png', label: 'surprise' }
      ];
    }

    // 2) load Human.js
    await new Promise<void>((res, rej) => {
      // @ts-ignore
      if ((window as any).Human) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.append(s);
    });

    // 3) webcam
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });
    video.srcObject = stream;
    await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
    await video.play();

    // 4) canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx = canvas.getContext('2d')!;

    // 5) Human init
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

    // 6) UI
    renderDots();
    setTargetImage(0);

    // 7) draw loop
    (async function drawLoop() {
      try {
        lastResult = await human.detect(video);
      } catch (e) { /* ignore occasional hiccups */ }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (showOverlay && lastResult) {
        try { human.draw.all(canvas, lastResult); } catch {}
      }

      requestAnimationFrame(drawLoop);
    })();
  });

  // ---------- UI helpers ----------
  function setTargetImage(i: number) {
    const el = document.querySelector<HTMLImageElement>('.target-face');
    if (el && targets[i]) el.src = targets[i].img;
  }

  function logFramesFor(ms: number) {
    const end = performance.now() + ms;
    let frame = 0;
    const tick = () => {
      if (performance.now() >= end) return;
      try {
        console.log('countdown frame', frame++, structuredClone(lastResult));
      } catch {
        console.log('countdown frame', frame++, lastResult);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function renderDots() {
    if (!bar) return;
    bar.innerHTML = '';
    targets.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'dot' + (i === currentIndex ? ' active' : '');
      bar.append(d);
    });
  }

  function advanceDot() {
    document.querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('active', i === currentIndex)
    );
  }

  // ---------- scoring ----------
  async function evaluateCurrent() {
    const result = await human.detect(video);

    const t = targets[currentIndex] || {};
    const labelRaw = (t as any).correct ?? t.label ?? t.emotion ?? t.name ?? t.answer ?? '';
    const target = normEmotion(labelRaw);

    const predicted = normEmotion(topEmotionFrom(result));

    let predicted2: string | null = null;
    const emo = result?.face?.[0]?.emotion;
    if (Array.isArray(emo) && emo.length > 1) {
      predicted2 = normEmotion(emo[1]?.emotion || '');
    }

    const correct = (!!predicted && predicted === target) || (!!predicted2 && predicted2 === target);
    results.push(!!correct);
    if (correct) score += 1;
  }

  function finish() {
    localStorage.setItem('mirroring_results', JSON.stringify(results));
    localStorage.setItem('mirroring_score', String(score));
    localStorage.setItem('mirroring_total', String(targets.length));
    goto('/mirroring/results');
  }

  function nextTarget() {
    currentIndex += 1;
    if (currentIndex >= targets.length) {
      finish();
      return;
    }
    setTargetImage(currentIndex);
    advanceDot();
  }

  // ---------- countdown ----------
  function startCountdown() {
    if (evaluating || instructionsOpen) return; // block until instructions dismissed
    evaluating = true;

    let cnt = 3;
    countdown.style.display = 'block';
    countdown.textContent = String(cnt);

    logFramesFor(3000);

    const iv = setInterval(() => {
      cnt -= 1;
      if (cnt > 0) {
        countdown.textContent = String(cnt);
      } else {
        clearInterval(iv);
        countdown.textContent = 'Go!';
        setTimeout(async () => {
          countdown.style.display = 'none';
          await evaluateCurrent();
          evaluating = false;
          nextTarget();
        }, 450);
      }
    }, 1000);
  }

  function goDashboard() { goto('/dashboard'); }
</script>

<svelte:head>
  <title>Mirroring Game – SocialQ</title>
</svelte:head>

<!-- background blobs already on page -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="header">
  <h1>Mirroring</h1>
</div>

<div class="mirroring-container">
  <div class="camera-area">
    <video bind:this={video} autoplay playsinline muted style="display:none;"></video>
    <canvas bind:this={canvas}></canvas>
    <img class="target-face" alt="Target Face" />
    <div bind:this={countdown} class="countdown"></div>
  </div>

  <div class="controls">
    <button class="record-btn" on:click={startCountdown} aria-label="Start countdown" disabled={instructionsOpen}></button>
    <button class="toggle-ui" on:click={() => (showOverlay = !showOverlay)}>
      {showOverlay ? 'Hide UI' : 'Show UI'}
    </button>
    <div bind:this={bar} class="progress-bar"></div>
  </div>
</div>

<!-- instructions modal -->
{#if instructionsOpen}
  <div class="modal-backdrop" on:click={() => (instructionsOpen = false)}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="How to play" on:click|stopPropagation>
      <div class="modal-header">
        <div class="badge">🪞</div>
        <h3>How to play</h3>
      </div>
      <div class="modal-body">
        <ul>
          <li>Mirror the picture as close as possible.</li>
          <li>When you are ready click the red button to start a countdown.</li>
          <li>At the end you will get a score.</li>
        </ul>
      </div>
      <div class="modal-actions">
        <button class="action" type="button" on:click={() => (instructionsOpen = false)}>Got it</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :root{
    --brand: #4f46e5;
    --brand2: #22d3ee;
    --ink: #0f172a;
    --glass: rgba(255,255,255,0.32);
    --glass-strong: rgba(255,255,255,0.48);
  }

  :global(body) {
    margin: 0;
    font-family: Arial, sans-serif;
    overflow: hidden;
    /* soft colorful backdrop behind your blobs */
    background:
      radial-gradient(1200px 800px at 20% 0%, rgba(79,70,229,.10), transparent 60%),
      radial-gradient(1200px 800px at 80% 30%, rgba(34,211,238,.12), transparent 60%),
      #f7f7fb;
  }

  .header {
    position: absolute; top: 0; width: 100%;
    display: flex; justify-content: center; align-items: center;
    padding: 12px 20px; z-index: 10;
  }
  .header h1 {
    margin: 0; color: #fff; font-family: Georgia, serif; font-size: 3.2rem;
    text-shadow: 0 3px 8px rgba(0,0,0,.6);
  }

  .mirroring-container {
    position: absolute; top: 100px; bottom: 40px; left: 150px; right: 150px;
    /* prettier glass with gentle color */
    background:
      linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.22)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.12), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.12), transparent 60%);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,.6);
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,.45);
    display: flex; flex-direction: column; justify-content: space-between; align-items: center;
    z-index: 5; overflow: hidden;
  }

  .camera-area {
    position: relative; flex: 1; width: 100%;
    display: flex; justify-content: center; align-items: center;
  }

  canvas {
    position: absolute; width: 100%; height: auto; object-fit: cover;
    border-radius: 12px; z-index: 2; pointer-events: none;
    box-shadow: 0 2px 18px rgba(0,0,0,.2) inset;
  }

  .target-face {
    position: absolute; top: 12px; right: 12px;
    width: 220px; height: 220px; background: #fff; border: 2px solid #333;
    border-radius: 8px; object-fit: cover; z-index: 6;
  }

  .countdown {
    position: absolute; font-size: 4rem; color: #fff;
    text-shadow: 0 4px 10px rgba(0,0,0,.7); display: none; z-index: 6;
  }

  .controls { padding: 16px; z-index: 6; display: flex; flex-direction: column; align-items: center; }

  .record-btn {
    width: 52px; height: 52px; background: #ef4444; border: none; border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0,0,0,.6); cursor: pointer; margin-bottom: 12px;
    transition: transform .08s ease, filter .2s ease;
  }
  .record-btn:hover { transform: translateY(-1px); }
  .record-btn[disabled]{ opacity: .6; cursor: not-allowed; filter: grayscale(0.1); }

  .toggle-ui {
    background: linear-gradient(135deg, rgba(255,255,255,.96), #f5f3ff);
    border: 1px solid rgba(79,70,229,.35);
    border-radius: 10px;
    padding: 8px 14px;
    cursor: pointer; margin-bottom: 12px;
    color: var(--ink);
    box-shadow: 0 6px 18px rgba(79,70,229,.15);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .toggle-ui:hover { filter: brightness(1.02); box-shadow: 0 10px 26px rgba(79,70,229,.22); }
  .toggle-ui:active { transform: translateY(1px); }

  .progress-bar { display: flex; gap: 8px; }
  .dot { width: 40px; height: 8px; background: #e5e7eb; border-radius: 4px; transition: background .3s ease; }
  .dot.active { background: var(--brand); }

  /* modal styles with color */
  .modal-backdrop{
    position: fixed; inset: 0;
    background:
      radial-gradient(60% 40% at 20% 10%, rgba(79,70,229,.28), transparent 60%),
      radial-gradient(50% 40% at 80% 30%, rgba(34,211,238,.24), transparent 60%),
      rgba(0,0,0,.45);
    display: grid; place-items: center;
    z-index: 50;
    animation: fadeIn .18s ease;
  }
  .modal{
    width: min(640px, 94vw);
    background:
      linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86)),
      radial-gradient(120% 120% at 0% 0%, rgba(79,70,229,.18), transparent 60%),
      radial-gradient(120% 120% at 100% 0%, rgba(34,211,238,.18), transparent 60%);
    border: 1px solid rgba(79,70,229,.28);
    border-radius: 16px;
    box-shadow: 0 24px 68px rgba(0,0,0,.35);
    padding: 18px 18px 14px;
    text-align: left;
    color: var(--ink);
    animation: pop .18s ease;
  }
  .modal-header{
    display:flex; align-items:center; gap:10px; margin-bottom: 6px;
  }
  .badge{
    width: 34px; height: 34px; border-radius: 9999px;
    display:grid; place-items:center;
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    box-shadow: 0 6px 18px rgba(79,70,229,.35);
    color: #fff; font-size: 18px;
  }
  .modal h3{ margin: 0; font-size: 1.25rem; }
  .modal-body{
    color:#111; line-height:1.55; padding: 6px 2px 0;
  }
  .modal-body ul{ margin: 0; padding-left: 18px; }
  .modal-body li{ margin: 6px 0; }
  .modal-actions{
    display:flex; justify-content:flex-end; gap:8px; margin-top: 12px;
  }
  .action{
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    color:#fff; border: none; border-radius: 10px;
    padding: 10px 16px; cursor: pointer;
    box-shadow: 0 10px 26px rgba(79,70,229,.28);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .action:hover{ filter: brightness(1.02); box-shadow: 0 14px 32px rgba(79,70,229,.36); }
  .action:active{ transform: translateY(1px); }

  @keyframes pop{ from{ transform: scale(.96); opacity: 0; } to{ transform: scale(1); opacity: 1; } }
  @keyframes fadeIn{ from{ opacity: 0; } to{ opacity: 1; } }
</style>
