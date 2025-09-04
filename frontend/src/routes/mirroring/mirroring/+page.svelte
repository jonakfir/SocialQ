<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  // ---------- NATIVE APP BRIDGE ----------
  const isNative = typeof window !== 'undefined'
    && !!(window as any).webkit?.messageHandlers?.app;

  function postToApp(payload: Record<string, any>) {
    try { (window as any).webkit?.messageHandlers?.app?.postMessage(payload); }
    catch { /* ignore if not available */ }
  }

  // ---------- refs ----------
  let cameraArea: HTMLDivElement;
  let video: HTMLVideoElement;          // hidden element, just a frame source
  let canvas: HTMLCanvasElement;        // we draw both video and overlays here
  let countdown: HTMLDivElement;
  let bar: HTMLDivElement;
  let ctx: CanvasRenderingContext2D;
  let human: any;

  // ---------- basic state ----------
  let currentIndex = 0;
  let showOverlay = true;
  let evaluating = false;
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

  // ---------- emotion helpers ----------
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

  // ---------- dynamic zoom ----------
  let autoZoom = true;
  let baseFaceW: number | null = null;
  let zoom = 1;
  let faceCX = 0;
  let faceCY = 0;

  const Z_MIN = 0.7;
  const Z_MAX = 1.6;
  const Z_ALPHA = 0.15;
  const C_ALPHA = 0.25;

  function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  function getBox(face: any) {
    const b = face?.box;
    if (!b) return null;
    if (Array.isArray(b)) {
      const [x, y, w, h] = b;
      return { x, y, w, h };
    } else {
      const x = b.x ?? b[0] ?? 0;
      const y = b.y ?? b[1] ?? 0;
      const w = b.width ?? b.w ?? b[2] ?? face?.size?.[0] ?? 0;
      const h = b.height ?? b.h ?? b[3] ?? face?.size?.[1] ?? 0;
      return { x, y, w, h };
    }
  }

  function recalibrate() {
    const face = lastResult?.face?.[0];
    const box = getBox(face);
    if (box && box.w > 0) baseFaceW = box.w;
  }

  function sizeCanvasToArea() {
    if (!cameraArea || !canvas) return;
    const r = cameraArea.getBoundingClientRect();
    canvas.width  = Math.max(1, Math.floor(r.width));
    canvas.height = Math.max(1, Math.floor(r.height));
  }

  function computeCrop(zoomFactor: number) {
    const vw = video?.videoWidth  || 1;
    const vh = video?.videoHeight || 1;
    const cw = canvas.width;
    const ch = canvas.height;

    const arC = cw / ch;
    const arV = vw / vh;

    let sw: number, sh: number;
    if (arV > arC) {
      sh = vh;
      sw = sh * arC;
    } else {
      sw = vw;
      sh = sw / arC;
    }

    sw /= zoomFactor;
    sh /= zoomFactor;

    const cx = faceCX || vw / 2;
    const cy = faceCY || vh / 2;

    const halfW = sw / 2, halfH = sh / 2;
    const sx = clamp(cx - halfW, 0, vw - sw);
    const sy = clamp(cy - halfH, 0, vh - sh);
    return { sx, sy, sw, sh };
  }

  async function ensureCamera(): Promise<void> {
    // attributes required by iOS/WKWebView for inline playback
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');

    if (video.srcObject) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    video.srcObject = stream;
    await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
    await video.play();
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

    // 2) load Human only once
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
    await ensureCamera();

    // 4) canvas and resize handling
    sizeCanvasToArea();
    ctx = canvas.getContext('2d')!;
    const onResize = () => sizeCanvasToArea();
    window.addEventListener('resize', onResize);

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

    // 6) UI bits
    renderDots();
    setTargetImage(0);

    // 7) let native app know the page is ready
    postToApp({ type: 'ready' });

    // 8) main loop
    (async function drawLoop() {
      try { lastResult = await human.detect(video); } catch {}

      const face = lastResult?.face?.[0];
      const box = getBox(face);
      if (box && box.w > 0 && box.h > 0) {
        if (baseFaceW == null) baseFaceW = box.w;
        const targetScale = autoZoom ? clamp((baseFaceW as number) / box.w, Z_MIN, Z_MAX) : 1;
        zoom = lerp(zoom, targetScale, Z_ALPHA);

        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        faceCX = lerp(faceCX || cx, cx, C_ALPHA);
        faceCY = lerp(faceCY || cy, cy, C_ALPHA);
      } else {
        zoom = lerp(zoom, 1, Z_ALPHA);
      }

      const { sx, sy, sw, sh } = computeCrop(zoom);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      if (showOverlay && lastResult) {
        const sxScale = canvas.width / sw;
        const syScale = canvas.height / sh;
        ctx.setTransform(sxScale, 0, 0, syScale, -sx * sxScale, -sy * syScale);
        try { human.draw.all(canvas, lastResult); } catch {}
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      requestAnimationFrame(drawLoop);
    })();

    onDestroy(() => {
      window.removeEventListener('resize', onResize);
      try { (video.srcObject as MediaStream)?.getTracks()?.forEach(t => t.stop()); } catch {}
    });
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
      try { console.log('countdown frame', frame++, structuredClone(lastResult)); }
      catch { console.log('countdown frame', frame++, lastResult); }
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
    // Persist in browser (keeps your existing flow for web)
    localStorage.setItem('mirroring_results', JSON.stringify(results));
    localStorage.setItem('mirroring_score', String(score));
    localStorage.setItem('mirroring_total', String(targets.length));

    // NEW: notify the native app
    postToApp({
      type: 'finished',
      results,
      score,
      total: targets.length
    });

    // In the app, Swift will navigate for you; in the browser keep your route
    if (!isNative) goto('/mirroring/results');
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
    if (evaluating || instructionsOpen) return;
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

<!-- The canvas fills this entire card, controls are overlaid on top -->
<div class="mirroring-container" bind:this={cameraArea}>
  <div class="camera-area">
    <video bind:this={video} autoplay playsinline muted style="display:none;"></video>
    <canvas bind:this={canvas}></canvas>
    <img class="target-face" alt="Target Face" />
    <div bind:this={countdown} class="countdown"></div>
  </div>

  <!-- Controls overlay: fully transparent -->
  <div class="controls">
    <button
      class="record-btn"
      on:click={startCountdown}
      aria-label="Start countdown"
      disabled={instructionsOpen}
    ></button>

    <!-- bottom left -->
    <button class="toggle-ui hide-ui-fixed" on:click={() => (showOverlay = !showOverlay)}>
      {showOverlay ? 'Hide UI' : 'Show UI'}
    </button>

    <!-- bottom right cluster: Auto zoom + scale + Recalibrate -->
    <div class="zoom-row corner-right">
      <label class="switch">
        <input type="checkbox" bind:checked={autoZoom} />
        <span>Auto zoom</span>
      </label>
      <button class="action small" type="button" on:click={recalibrate}>Recalibrate</button>
    </div>

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
          <li>Auto zoom keeps your face size steady as you move in and out.</li>
          <li>If the scale feels off tap Recalibrate while you are at a good distance.</li>
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
    background:
      linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.22)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.12), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.12), transparent 60%);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,.6);
    border-radius: 16px;
    box-shadow: 0 8px 40px rgba(0,0,0,.45);
    display: block;
    z-index: 5;
    overflow: hidden;
  }

  .camera-area {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    z-index: 2;
    pointer-events: none;
    box-shadow: inset 0 2px 18px rgba(0,0,0,.2);
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

  .controls {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    padding: 16px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    z-index: 9;
    background: transparent;
    backdrop-filter: none;
    pointer-events: auto;
  }

  .record-btn {
    width: 52px; height: 52px; background: #ef4444; border: none; border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0,0,0,.6); cursor: pointer; margin-bottom: 12px;
    transition: transform .08s ease, filter .2s ease;
  }
  .record-btn:hover { transform: translateY(-1px); }
  .record-btn[disabled]{ opacity: .6; cursor: not-allowed; filter: grayscale(0.1); }

  .hide-ui-fixed {
    position: absolute; left: 16px; bottom: 16px; z-index: 10;
  }
  .corner-right {
    position: absolute; right: 16px; bottom: 16px; z-index: 10;
  }

  .toggle-ui {
    background: linear-gradient(135deg, rgba(255,255,255,.96), #f5f3ff);
    border: 1px solid rgba(79,70,229,.35);
    border-radius: 10px;
    padding: 8px 14px;
    cursor: pointer;
    color: var(--ink);
    box-shadow: 0 6px 18px rgba(79,70,229,.15);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .toggle-ui:hover { filter: brightness(1.02); box-shadow: 0 10px 26px rgba(79,70,229,.22); }
  .toggle-ui:active { transform: translateY(1px); }

  .zoom-row { display: flex; align-items: center; gap: 10px; }
  .switch { display: inline-flex; align-items: center; gap: 8px; user-select: none; color: white; }
  .switch input { width: 18px; height: 18px; }
  .zoom-readout { font-size: 12px; color: #374151; }

  .progress-bar { display: flex; gap: 8px; }
  .dot { width: 40px; height: 8px; background: #e5e7eb; border-radius: 4px; transition: background .3s ease; }
  .dot.active { background: var(--brand); }

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
  .modal-header{ display:flex; align-items:center; gap:10px; margin-bottom: 6px; }
  .badge{
    width: 34px; height: 34px; border-radius: 9999px;
    display:grid; place-items:center;
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    box-shadow: 0 6px 18px rgba(79,70,229,.35);
    color: #fff; font-size: 18px;
  }
  .modal h3{ margin: 0; font-size: 1.25rem; }
  .modal-body{ color:#111; line-height:1.55; padding: 6px 2px 0; }
  .modal-body ul{ margin: 0; padding-left: 18px; }
  .modal-body li{ margin: 6px 0; }
  .modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top: 12px; }
  .action{
    background: linear-gradient(135deg, var(--brand), var(--brand2));
    color:#fff; border: none; border-radius: 10px;
    padding: 10px 16px; cursor: pointer;
    box-shadow: 0 10px 26px rgba(79,70,229,.28);
    transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
  }
  .action.small { padding: 6px 10px; font-size: 12px; }
  .action:hover{ filter: brightness(1.02); box-shadow: 0 14px 32px rgba(79,70,229,.36); }
  .action:active{ transform: translateY(1px); }

  @keyframes pop{ from{ transform: scale(.96); opacity: 0; } to{ transform: scale(1); opacity: 1; } }
  @keyframes fadeIn{ from{ opacity: 0; } to{ opacity: 1; } }
</style>
