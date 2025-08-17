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
  let evaluating = false;          // lock while countdown/eval runs
  let lastResult: any = null;

  // targets returned by your /ekman endpoint
  type Target = { img: string; label?: string; difficulty?: string; correct?: string; emotion?: string; name?: string; answer?: string };
  let difficulty = '4';
  let targets: Target[] = [];

  // scoring
  let results: boolean[] = [];
  let score = 0;

  // ---------- helpers: emotions ----------
  // map any synonyms Human might return -> our canonical label
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
    return EMO_MAP[k] ?? k; // fall back to whatever Human gives
  }
  function topEmotionFrom(result: any): string | null {
    const face = result?.face?.[0];
    const arr = Array.isArray(face?.emotion) ? face.emotion : [];
    if (!arr.length) return null;
    const best = arr.reduce(
      (a: any, b: any) => (b.score > a.score ? b : a),
      arr[0]
    );
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
    await new Promise<void>((r) => {
      video.onloadedmetadata = () => r();
    });
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
      // keep a live result so overlay looks responsive; scoring happens at countdown zero
      try {
        lastResult = await human.detect(video);
      } catch (e) {
        // swallow occasional WebGL hiccups
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // draw video
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // overlay
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

    // normalize target label from multiple possible fields
    const t = targets[currentIndex] || {};
    const labelRaw =
      (t as any).correct ?? t.label ?? t.emotion ?? t.name ?? t.answer ?? '';
    const target = normEmotion(labelRaw);

    // top predicted, normalized
    const predicted = normEmotion(topEmotionFrom(result));

    // second best if present
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

    // console.log({ target, predicted, predicted2, score });
  }

  function finish() {
    // Use mirroring-specific keys so we never collide with Facial Recognition
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
    if (evaluating) return; // prevent double taps
    evaluating = true;

    let cnt = 3;
    countdown.style.display = 'block';
    countdown.textContent = String(cnt);

    const iv = setInterval(() => {
      cnt -= 1;
      if (cnt > 0) {
        countdown.textContent = String(cnt);
      } else {
        clearInterval(iv);
        countdown.textContent = 'Go!';

        setTimeout(async () => {
          countdown.style.display = 'none';
          await evaluateCurrent();   // EVALUATE HERE
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

<!-- background blobs (your existing ones) -->
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
    <button class="record-btn" on:click={startCountdown} aria-label="Start countdown"></button>
    <button class="toggle-ui" on:click={() => (showOverlay = !showOverlay)}>
      {showOverlay ? 'Hide UI' : 'Show UI'}
    </button>
    <div bind:this={bar} class="progress-bar"></div>
  </div>
</div>

<style>
  :global(body) { margin: 0; background: #fdfcfc; overflow: hidden; font-family: Arial, sans-serif; }

  .header {
    position: absolute; top: 0; width: 100%;
    display: flex; justify-content: center; align-items: center;
    padding: 12px 20px; z-index: 10;
  }
  .header h1 { margin: 0; color: #fff; font-family: Georgia, serif; font-size: 3.2rem;
    text-shadow: 0 3px 8px rgba(0,0,0,.6); }

  .mirroring-container {
    position: absolute; top: 100px; bottom: 40px; left: 150px; right: 150px;
    background: rgba(255,255,255,0.32); backdrop-filter: blur(20px);
    border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.5);
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
    width: 52px; height: 52px; background: red; border: none; border-radius: 50%;
    box-shadow: 0 4px 12px rgba(0,0,0,.6); cursor: pointer; margin-bottom: 12px;
  }

  .toggle-ui {
    background: rgba(255,255,255,.9); border: 1px solid #111; border-radius: 8px;
    padding: 6px 12px; cursor: pointer; margin-bottom: 12px;
  }

  .progress-bar { display: flex; gap: 8px; }
  .dot { width: 40px; height: 8px; background: #ddd; border-radius: 4px; transition: background .3s ease; }
  .dot.active { background: #4f46e5; }
</style>
