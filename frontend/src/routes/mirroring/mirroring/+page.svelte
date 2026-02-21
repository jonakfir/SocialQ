<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getUserKey } from '$lib/userKey';
  import { getHuman } from '$lib/human';

  // ---------- NATIVE APP BRIDGE ----------
  const isNative =
    typeof window !== 'undefined' &&
    !!(window as any).webkit?.messageHandlers?.app;

  function postToApp(payload: Record<string, any>) {
    try {
      (window as any).webkit?.messageHandlers?.app?.postMessage(payload);
    } catch {
      /* ignore if not available */
    }
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
  let loading = true;
  let cameraError = false;
  let currentTargetImg = ''; // reactive target image URL for the box

  // instructions modal
  let instructionsOpen = true;

  // targets returned by your /ekman endpoint
  type Target = {
    img: string;
    label?: string;
    difficulty?: string;
    correct?: string;
    emotion?: string;
    name?: string;
    answer?: string;
  };
  $: difficulty = $page.url.searchParams.get('difficulty') || '1';
  let targets: Target[] = [];

  /** Data URL for a placeholder face so target box always shows something without external assets. */
  function placeholderFaceDataUrl(emotion: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="140" height="140">
      <rect width="100" height="100" fill="#2a3250"/>
      <ellipse cx="50" cy="55" rx="28" ry="32" fill="#4a5568" stroke="#73a6f2" stroke-width="2"/>
      <circle cx="38" cy="48" r="4" fill="#e2e8f0"/>
      <circle cx="62" cy="48" r="4" fill="#e2e8f0"/>
      <path d="M 35 68 Q 50 78 65 68" stroke="#e2e8f0" stroke-width="3" fill="none" stroke-linecap="round"/>
      <text x="50" y="92" font-size="10" fill="#94a3b8" text-anchor="middle">${emotion}</text>
    </svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

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
    if (!video) return;
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');

    if (video.srcObject) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      video.srcObject = stream;
      await new Promise<void>((r, rej) => {
        video.onloadedmetadata = () => r();
        video.onerror = () => rej(new Error('Video failed to load'));
        if (video.readyState >= 1) r();
      });
      await video.play();
    } catch (e) {
      console.error('[mirroring] Camera error:', e);
      cameraError = true;
    }
  }

  onMount(async () => {
    try {
      // mark body so CSS can change layout when embedded in the native app
      if (isNative) {
        document.body.classList.add('native');
      }

      // 1) Load shared Human (cached) and targets in parallel
      const fallbackTargets: Target[] = [
        { img: placeholderFaceDataUrl('Happy'), label: 'Happy' },
        { img: placeholderFaceDataUrl('Anger'), label: 'Anger' },
        { img: placeholderFaceDataUrl('Surprise'), label: 'Surprise' }
      ];

      const targetsPromise = (async () => {
        try {
          const { apiFetch } = await import('$lib/api');
          const res = await apiFetch(`/ekman?difficulty=${encodeURIComponent(difficulty)}&count=8&ekmanOnly=1`);
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            targets = rows;
          } else {
            targets = fallbackTargets;
          }
        } catch (e) {
          console.error('Failed to load ekman targets:', e);
          targets = fallbackTargets;
        }
        currentTargetImg = targets[0]?.img ?? '';
        await tick();
      })();

      const [humanInstance] = await Promise.all([getHuman(), targetsPromise]);
      human = humanInstance;

      // 2) webcam
      await ensureCamera();

      // 3) canvas and resize handling
      if (!canvas) throw new Error('Canvas ref missing');
      sizeCanvasToArea();
      ctx = canvas.getContext('2d')!;
      const onResize = () => sizeCanvasToArea();
      window.addEventListener('resize', onResize);

      // 4) UI bits
      renderDots();
      setTargetImage(0);
      currentTargetImg = targets[0]?.img ?? '';

      // 5) ready: hide loading, start draw loop
      loading = false;
      postToApp({ type: 'ready' });

      // 6) main loop
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
      if (video.srcObject && video.videoWidth > 0) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = 'rgba(26, 31, 71, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'min(4vw, 18px) sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cameraError ? 'Camera unavailable. Allow access and refresh.' : 'Starting camera…', canvas.width / 2, canvas.height / 2);
      }

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
    } catch (e) {
      console.error('[mirroring] init error:', e);
      loading = false;
    }
  });

  // ---------- UI helpers ----------
  function setTargetImage(i: number) {
    const url = targets[i]?.img ?? '';
    currentTargetImg = url;
    const el = document.querySelector<HTMLImageElement>('.target-face');
    if (el) el.src = url;
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

    const t: Target | undefined = targets[currentIndex];
    const labelRaw =
      t?.correct ??
      t?.label ??
      t?.emotion ??
      t?.name ??
      t?.answer ??
      '';
    const target = normEmotion(labelRaw);

    const predicted = normEmotion(topEmotionFrom(result));

    let predicted2: string | null = null;
    const emo = result?.face?.[0]?.emotion;
    if (Array.isArray(emo) && emo.length > 1) {
      predicted2 = normEmotion(emo[1]?.emotion || '');
    }

    const correct =
      (!!predicted && predicted === target) ||
      (!!predicted2 && predicted2 === target);
    results.push(!!correct);
    if (correct) score += 1;
  }

  async function finish() {
    const userKey = getUserKey();
    
    // Store all data with user-specific keys to prevent cross-user data leakage
    localStorage.setItem(`mirroring_results_${userKey}`, JSON.stringify(results));
    localStorage.setItem(`mirroring_score_${userKey}`, String(score));
    localStorage.setItem(`mirroring_total_${userKey}`, String(targets.length));

    // NEW: notify the native app
    postToApp({
      type: 'finished',
      results,
      score,
      total: targets.length
    });

    // Save to database for admin statistics
    try {
      const { apiFetch } = await import('$lib/api');
      // For mirroring, we don't track start time separately, so estimate based on game completion
      // or use null if not tracked
      const elapsedMs = null; // Mirroring doesn't track completion time currently
      
      await apiFetch('/api/game-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'mirroring',
          difficulty: difficulty || null,
          score,
          total: targets.length,
          timeMs: elapsedMs,
          questions: targets.map((target, idx) => ({
            questionIndex: idx,
            correct: target.correct || target.emotion || target.label || 'unknown',
            picked: results[idx] ? (target.correct || target.emotion || target.label || 'unknown') : '__timeout__',
            isCorrect: results[idx]
          }))
        })
      });
    } catch (error) {
      console.error('[mirroring] Failed to save session to database:', error);
      // Continue anyway - localStorage is the source of truth
    }

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
    countdown.classList.add('show');
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
          countdown.classList.remove('show');
          await evaluateCurrent();
          evaluating = false;
          nextTarget();
        }, 450);
      }
    }, 1000);
  }

  function goDashboard() { goto('/dashboard'); }
  function goSettings() { goto('/mirroring/settings'); }

  $: statusText = loading
    ? 'Loading camera & face detection…'
    : lastResult?.face?.[0]
      ? (() => {
          const emo = lastResult.face[0].emotion;
          if (Array.isArray(emo) && emo.length) {
            const top = emo.reduce((a: any, b: any) => (b.score > a.score ? b : a), emo[0]);
            return `Detecting… ${top.emotion} ${Math.round((top.score || 0) * 100)}%`;
          }
          return 'Detecting…';
        })()
      : 'Detecting…';
</script>

<svelte:head>
  <title>Mirroring Game – SocialQ</title>
</svelte:head>

{#if !isNative}
  <header class="top-bar">
    <div class="top-bar-left">
      <button type="button" class="circle-btn" aria-label="Close" on:click={goSettings}>
        <span aria-hidden="true">×</span>
      </button>
      <button
        type="button"
        class="circle-btn"
        aria-label={autoZoom ? 'Face framing on' : 'Face framing off'}
        title="Toggle auto zoom"
        on:click={() => (autoZoom = !autoZoom)}
      >
        <span aria-hidden="true">{autoZoom ? '⊞' : '▢'}</span>
      </button>
    </div>
    <h1 class="top-bar-title">Mirroring Exercises</h1>
    <div class="top-bar-right">
      <button
        type="button"
        class="record-btn-top"
        aria-label="Record"
        disabled={instructionsOpen}
        on:click={startCountdown}
      ></button>
    </div>
  </header>
{/if}

<div class="stage-wrap" bind:this={cameraArea}>
  <div class="camera-area">
    <video bind:this={video} autoplay playsinline muted style="display:none;"></video>
    <canvas bind:this={canvas}></canvas>
    <img class="target-face" alt="Target Face" src={currentTargetImg} />
    <div bind:this={countdown} class="countdown"></div>
  </div>

  {#if !isNative}
    <div class="status-pill">{statusText}</div>
    <div bind:this={bar} class="progress-dots"></div>
    <button
      type="button"
      class="mesh-pill"
      aria-label="Toggle mesh overlay"
      on:click={() => (showOverlay = !showOverlay)}
    >
      <span class="mesh-icon">{showOverlay ? '◉' : '○'}</span>
      <span>{showOverlay ? 'Mesh On' : 'Mesh Off'}</span>
    </button>
  {/if}
</div>

<!-- instructions modal (keep visible for both; close with “Got it”) -->
{#if instructionsOpen}
  <div class="modal-backdrop" on:click={() => (instructionsOpen = false)}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="How to play" on:click|stopPropagation>
      <h3 class="modal-title">About Face</h3>
      <p class="modal-subtitle">Mirroring</p>
      <div class="modal-body">
        <p class="modal-instructions-label">Instructions:</p>
        <ol class="modal-list">
          <li>Mirror the picture as close as possible.</li>
          <li>When you are ready click the red button to start a countdown.</li>
          <li>Auto zoom keeps your face size steady as you move in and out.</li>
          <li>If the scale feels off tap Recalibrate while you are at a good distance.</li>
          <li>At the end you will get a score.</li>
        </ol>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" type="button" on:click={() => (instructionsOpen = false)}>Got it</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Top bar: iOS-style */
  .top-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 76px;
    padding-top: env(safe-area-inset-top, 0);
    background: var(--af-deep-blue);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 16px;
    padding-right: 20px;
    z-index: 20;
    box-sizing: border-box;
  }
  .top-bar-left, .top-bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .top-bar-title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    font-family: Georgia, serif;
    font-size: 34px;
    font-weight: bold;
    color: var(--af-mirroring-yellow);
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.45);
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
  }
  .circle-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    color: #fff;
    font-size: 24px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s ease;
  }
  .circle-btn:hover { background: rgba(255, 255, 255, 0.25); }
  .circle-btn:active { transform: scale(0.96); }
  .record-btn-top {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.9);
    background: var(--af-record-red);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s ease;
  }
  .record-btn-top:hover { transform: translateY(-1px); }
  .record-btn-top:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Stage: fills below top bar */
  .stage-wrap {
    position: fixed;
    top: 76px;
    top: calc(76px + env(safe-area-inset-top, 0px));
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    z-index: 1;
  }
  :global(body.native) .stage-wrap {
    top: 0;
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
    object-fit: cover;
    z-index: 2;
    pointer-events: none;
  }
  .target-face {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 140px;
    height: 140px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 12px;
    object-fit: cover;
    z-index: 6;
    box-shadow: 0 10px 36px rgba(0, 0, 0, 0.45);
  }
  .countdown {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
    font-size: 84px;
    font-weight: 900;
    color: #fff;
    text-shadow: 0 6px 26px rgba(0, 0, 0, 0.7);
    z-index: 8;
  }
  .countdown.show {
    display: grid;
  }

  /* Bottom controls */
  .status-pill {
    position: absolute;
    left: 16px;
    bottom: 16px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    backdrop-filter: blur(8px);
    font-size: 14px;
    z-index: 10;
  }
  .progress-dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100px;
    display: flex;
    gap: 6px;
    justify-content: center;
    z-index: 10;
  }
  .progress-dots :global(.dot) {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.35);
  }
  .progress-dots :global(.dot.active) {
    background: var(--af-glow-blue);
    box-shadow: 0 0 8px rgba(115, 166, 242, 0.5);
  }
  .mesh-pill {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 9999px;
    background: rgba(26, 31, 71, 0.9);
    border: 1px solid rgba(115, 166, 242, 0.6);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .mesh-pill:hover { filter: brightness(1.05); }
  .mesh-icon { font-size: 18px; }

  /* Instructions modal: AboutFace style */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: 50;
    animation: modalFadeIn 0.18s ease;
  }
  .modal {
    width: min(640px, 94vw);
    padding: 24px;
    background: rgba(26, 31, 71, 0.95);
    border: 1px solid rgba(115, 166, 242, 0.5);
    border-radius: 20px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    text-align: left;
    animation: modalPop 0.18s ease;
  }
  .modal-title {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: bold;
    color: #fff;
  }
  .modal-subtitle {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
    color: var(--af-mirroring-yellow);
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .modal-body { margin-bottom: 16px; }
  .modal-instructions-label {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: bold;
    color: var(--af-mirroring-yellow);
  }
  .modal-list {
    margin: 0;
    padding-left: 20px;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.6;
  }
  .modal-list li { margin: 6px 0; }
  .modal-actions { display: flex; justify-content: flex-end; }
  .modal-btn {
    padding: 12px 28px;
    font-size: 16px;
    font-weight: bold;
    color: var(--af-dark-navy);
    background: var(--af-glow-blue);
    border: 1px solid var(--af-glow-blue);
    border-radius: 12px;
    cursor: pointer;
    transition: filter 0.2s ease;
  }
  .modal-btn:hover { filter: brightness(1.1); }
  @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modalPop { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  /* Desktop: camera still full-screen below header */
  @media (min-width: 768px) {
    .top-bar-title { font-size: clamp(24px, 3vw, 34px); }
    .target-face {
      width: 160px;
      height: 160px;
      top: 24px;
      right: 24px;
    }
    .status-pill { left: 24px; bottom: 24px; }
    .progress-dots { bottom: 100px; }
    .mesh-pill { right: 24px; bottom: 24px; }
  }
</style>
