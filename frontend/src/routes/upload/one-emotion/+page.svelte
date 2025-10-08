<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';

  const EMOTIONS = ['Angry','Disgust','Fear','Happy','Sad','Surprise'] as const;
  type Emotion = typeof EMOTIONS[number];
  let currentTag: Emotion = 'Happy';

  const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  const canonicalEmotion = (s: string) => {
    const n = (s || '').toLowerCase();
    const map: Record<string, string> = {
      angry:'angry', anger:'angry',
      disgust:'disgust', disgusted:'disgust',
      fear:'fear', fearful:'fear', afraid:'fear',
      happy:'happy', happiness:'happy',
      sad:'sad', sadness:'sad',
      surprise:'surprise', surprised:'surprise',
      neutral:'neutral'
    };
    return map[n] ?? n;
  };
  const selectedCanon = () => canonicalEmotion(currentTag);

  let panelEl: HTMLDivElement;
  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  // camera / human state
  let human: any = null;
  let humanReady = false;

  let scoring = false;
  let frozen = false;
  let errorMsg = '';
  let cameraError = '';
  let statusMsg = '';

  let showPassFrame = false;
  let frameTimer: number | null = null;
  let lastShotDataUrl = '';

  // toast
  let toastMsg = '';
  let toastTimer: number | null = null;

  const PASS_THRESHOLD = 0.45;
  const APP_LINK = 'https://social-q-theta.vercel.app/';

  // ───────────────── Camera ─────────────────
  async function waitForVideoReady(timeoutMs = 5000) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      // Safari often reports 0x0 briefly even after canplay
      if ((videoEl?.videoWidth ?? 0) > 0 && (videoEl?.videoHeight ?? 0) > 0) return true;
      await new Promise((r) => setTimeout(r, 60));
      try { await videoEl?.play(); } catch {}
    }
    return false;
  }

  async function ensureCamera() {
    statusMsg = 'Starting camera…';
    cameraError = '';

    // important for iOS autoplay
    if (videoEl) {
      videoEl.setAttribute('playsinline','');
      videoEl.setAttribute('autoplay','');
      videoEl.muted = true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      videoEl.srcObject = stream;

      // wait basic metadata
      await new Promise<void>((resolve) => {
        const to = setTimeout(resolve, 1500);
        videoEl.onloadedmetadata = () => { clearTimeout(to); resolve(); };
      });

      // nudge play a couple of times
      try { await videoEl.play(); } catch {}
      await new Promise((r) => setTimeout(r, 80));
      try { await videoEl.play(); } catch {}

      // HARD wait until we actually have dimensions
      const ready = await waitForVideoReady(6000);
      if (!ready) throw new Error('Camera stream did not become ready');

      statusMsg = '';
    } catch (e: any) {
      cameraError = (e?.name === 'NotAllowedError')
        ? 'Camera permission denied. Please allow camera access and refresh.'
        : 'Unable to access camera.';
      statusMsg = '';
    }
  }

  function sizeCanvasToPanel() {
    const r = panelEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvasEl.width  = Math.max(1, Math.floor(r.width  * dpr));
    canvasEl.height = Math.max(1, Math.floor(r.height * dpr));
    // keep CSS size as visual pixels
    canvasEl.style.width = `${Math.floor(r.width)}px`;
    canvasEl.style.height = `${Math.floor(r.height)}px`;
  }

  function drawFrameToCanvas() {
    const vw = videoEl?.videoWidth || 0;
    const vh = videoEl?.videoHeight || 0;
    if (!vw || !vh) return;

    const cw = canvasEl.width, ch = canvasEl.height;
    const arC = cw / ch, arV = vw / vh;

    let sw: number, sh: number;
    if (arV > arC) { sh = vh; sw = sh * arC; } else { sw = vw; sh = sw / arC; }
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.restore();
  }

  // ───────────────── Human.js ─────────────────
  async function loadHuman() {
    if ((window as any).Human?.Human) return (window as any).Human.Human;
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
      s.onload = () => res();
      s.onerror = rej;
      document.head.append(s);
    });
    return (window as any).Human.Human;
  }

  async function ensureHuman() {
    if (humanReady) return;
    statusMsg = statusMsg || 'Loading models…';
    const HumanCtor = await loadHuman();
    human = new HumanCtor({
      backend: 'webgl',
      modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
      face: { enabled: true, detector: { enabled: true, maxDetected: 1 }, mesh: { enabled: true }, emotion: { enabled: true } },
      body: false, hand: false, object: false, gesture: false
    });
    await human.load();
    try { await human.warmup(); } catch {}
    humanReady = true;
    if (!scoring) statusMsg = '';
  }

  // ───────────────── Scoring helpers ─────────────────
  async function detectEmotionAvg(frames = 8, gapMs = 50) {
    const keys = ['angry','disgust','fear','happy','sad','surprise'] as const;
    const sum: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };

    for (let i = 0; i < frames; i++) {
      drawFrameToCanvas();
      const det = await human.detect(canvasEl);
      const face = det?.face?.[0];
      const arr: Array<{ emotion:string; score:number }> = face?.emotion || face?.emotions || [];
      if (arr?.length) {
        const frameMax: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };
        for (const it of arr) {
          const k = canonicalEmotion(it.emotion);
          if (k && k in frameMax) frameMax[k] = Math.max(frameMax[k], Number(it.score ?? 0));
        }
        for (const k of keys) sum[k] += frameMax[k];
      }
      if (gapMs) await new Promise(r => setTimeout(r, gapMs));
    }

    let total = 0; for (const k in sum) total += sum[k];
    if (!total) { for (const k in sum) sum[k] = 1e-6; total = 6e-6; }
    const probs: Record<string, number> = {}; for (const k of keys) probs[k] = sum[k] / total;
    const topKey = (keys as unknown as string[]).reduce((a,b)=> probs[b] > probs[a] ? b : a, keys[0] as unknown as string);
    return { probs, top: { emotion: topKey, score: probs[topKey] } };
  }

  function estimateBrightness(el: HTMLCanvasElement) {
    const w = Math.max(1, Math.floor(el.width / 8));
    const h = Math.max(1, Math.floor(el.height / 8));
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(el, 0, 0, w, h);
    const data = tctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i=0; i<data.length; i+=4) sum += 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
    return sum / (data.length/4);
  }

  // ───────────────── Share helpers ─────────────────
  const isiOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
  const smsJoiner = () => (isiOS() ? '&' : '?');
  function dataURL() { return canvasEl.toDataURL('image/jpeg', 0.95); }

  async function dataURLtoFiles(dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob();
    const jpg = new File([blob], 'aboutface.jpg', { type: blob.type || 'image/jpeg' });
    let png: File | null = null;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const pngUrl = c.toDataURL('image/png', 1);
      const pngBlob = await (await fetch(pngUrl)).blob();
      png = new File([pngBlob], 'aboutface.png', { type: 'image/png' });
    } catch {}
    return { jpg, png };
  }

  async function copyImageToClipboard(file: File, alt?: File | null) {
    const primary = alt?.type === 'image/png' ? alt : file;
    try {
      // @ts-ignore
      if (navigator.clipboard?.write && window.ClipboardItem) {
        const item = new ClipboardItem({ [primary.type]: primary } as Record<string, Blob>);
        // @ts-ignore
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch {}
    return false;
  }

  async function copyImageViaContentEditable(dataUrl: string) {
    try {
      const host = document.createElement('div');
      host.contentEditable = 'true';
      host.style.cssText = 'position:fixed;left:-99999px;top:0;';
      host.innerHTML = `<img src="${dataUrl}">`;
      document.body.appendChild(host);
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(host);
      sel?.removeAllRanges(); sel?.addRange(range);
      const ok = document.execCommand('copy');
      sel?.removeAllRanges(); document.body.removeChild(host);
      return ok;
    } catch { return false; }
  }

  function showToast(msg: string, ms = 2600) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toastMsg = ''), ms) as unknown as number;
  }

  function closeAllCards() { errorMsg = ''; showPassFrame = false; frozen = false; }

  async function shareImage() {
    const label = selectedCanon();
    const text = `I just nailed a ${label} face on SocialQ’s AboutFace! Try it: ${APP_LINK}`;
    const smsUrl = `sms:${smsJoiner()}body=${encodeURIComponent(text)}`;
    try {
      if (!lastShotDataUrl) {
        try { await navigator.clipboard?.writeText?.(text); } catch {}
        location.href = smsUrl; showToast('Message copied — paste in Messages'); closeAllCards(); return;
      }
      const { jpg, png } = await dataURLtoFiles(lastShotDataUrl);
      let copied = await copyImageToClipboard(jpg, png);
      if (!copied) copied = await copyImageViaContentEditable(lastShotDataUrl);
      location.href = smsUrl;
      if (copied) showToast('Photo copied — paste it in Messages');
      else { try { await navigator.clipboard?.writeText?.(text); } catch {} showToast('Couldn’t copy photo — message text is copied'); }
    } catch {
      try { await navigator.clipboard?.writeText?.(`Try AboutFace: ${APP_LINK}`); } catch {}
      showToast('Sharing unavailable — link copied');
    } finally { closeAllCards(); }
  }

  async function captureAndCheck() {
    if (scoring) return;
    scoring = true; errorMsg = ''; showPassFrame = false;
    try {
      await ensureHuman();
      const { probs, top } = await detectEmotionAvg(8, 50);
      drawFrameToCanvas();
      lastShotDataUrl = dataURL();
      frozen = true;
      const want = selectedCanon();
      const wantProb = probs[want] ?? 0;
      const pass = top.emotion === want || wantProb >= PASS_THRESHOLD;
      if (pass) {
        showPassFrame = true;
        if (frameTimer) clearTimeout(frameTimer);
        frameTimer = window.setTimeout(() => { showPassFrame = false; }, 2000);
        const b = estimateBrightness(canvasEl);
        if (b < 70) {/* optional hint */}
      } else {
        const b = estimateBrightness(canvasEl);
        const hint = b < 60 ? ' (try more light)' : '';
        throw new Error(`Didn’t look like “${titleCase(currentTag)}”${hint}.`);
      }
    } catch (e: any) {
      errorMsg = e?.message || 'scoring failed';
    } finally { scoring = false; }
  }

  async function ensureLiveDrawing() {
    const stream = videoEl?.srcObject as MediaStream | null;
    const live = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) await ensureCamera();
    frozen = false;
  }

  function resetShot() {
    errorMsg = ''; showPassFrame = false; frozen = false;
    if (frameTimer) clearTimeout(frameTimer); frameTimer = null;
    ensureLiveDrawing();
  }

  function goBack(){ goto('/upload'); }

  // ───────────────── Lifecycle ─────────────────
  onMount(async () => {
    // Preselect from query
    const url = new URL(get(page).url);
    const p = (url.searchParams.get('emotion') ?? '').toLowerCase();
    const map: Record<string, Emotion> = {
      happiness:'Happy', happy:'Happy', sadness:'Sad', sad:'Sad',
      anger:'Angry', angry:'Angry', fear:'Fear', afraid:'Fear',
      surprise:'Surprise', surprised:'Surprise', disgust:'Disgust'
    };
    if (map[p]) currentTag = map[p];

    await ensureCamera();      // ensure real stream before we start drawing

    sizeCanvasToPanel();
    ctx = canvasEl.getContext('2d')!;

    const onResize = () => sizeCanvasToPanel();
    window.addEventListener('resize', onResize);

    const onVis = () => { if (document.visibilityState === 'visible') ensureLiveDrawing(); };
    window.addEventListener('focus', ensureLiveDrawing);
    document.addEventListener('visibilitychange', onVis);

    onDestroy(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('focus', ensureLiveDrawing);
      document.removeEventListener('visibilitychange', onVis);
      try { (videoEl.srcObject as MediaStream)?.getTracks()?.forEach(t => t.stop()); } catch {}
    });

    // continuous render
    (function loop(){
      if (!frozen) drawFrameToCanvas();
      requestAnimationFrame(loop);
    })();

    ensureHuman().catch((e)=>console.warn('human load failed', e));
  });
</script>

<svelte:head><title>One Emotion – SocialQ</title></svelte:head>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<!-- chips -->
<div class="chip-row">
  {#each EMOTIONS as e}
    <button class="chip {currentTag === e ? 'active' : ''}" on:click={() => (currentTag = e)} aria-pressed={currentTag === e}>{e}</button>
  {/each}
</div>

<!-- camera panel -->
<div class="panel" bind:this={panelEl}>
  <video bind:this={videoEl} autoplay playsinline muted
    style="position:absolute; inset:0; width:100%; height:100%; opacity:0; pointer-events:none;"></video>
  <canvas bind:this={canvasEl}></canvas>

  <div class="bottom-bar">
    <div class="tag">Selected emotion: {titleCase(currentTag)}</div>
    <button class="record-btn" on:click={captureAndCheck} aria-label="Capture"></button>
    <div></div>
  </div>

  {#if statusMsg}
    <div class="status">{statusMsg}</div>
  {/if}
</div>

<!-- pass frame -->
{#if showPassFrame}
  <div class="antique-wrap">
    <div class="antique-frame">
      <div class="antique-inner">
        <img src={lastShotDataUrl} alt="Captured"/>
      </div>
      <div class="gold-trim"></div>
    </div>
  </div>
{/if}

<!-- cards -->
{#if cameraError}
  <div class="card error">
    <div class="title">Camera blocked</div>
    <div class="sub">{cameraError}</div>
  </div>
{:else if scoring}
  <div class="card"><div class="title">Checking…</div></div>
{:else if errorMsg}
  <div class="card warn">
    <div class="title">Not quite!</div>
    <div class="sub">{errorMsg}</div>
    <button class="btn outline" on:click={resetShot}>Try again</button>
  </div>
{:else if lastShotDataUrl && !showPassFrame && frozen}
  <div class="card success">
    <div class="title">Great shot!</div>
    <div class="sub">That looked like <b>{titleCase(currentTag)}</b>.</div>
    <div class="row">
      <button class="btn outline" on:click={resetShot}>Take another</button>
      <button class="btn primary" on:click={shareImage}>Share</button>
    </div>
  </div>
{/if}

{#if toastMsg}
  <div class="toast">{toastMsg}</div>
{/if}

<button class="back-btn" on:click={() => goto('/upload')}>← Back</button>

<style>
  @import '/style.css';
  :root{ --brand:#4f46e5; --brand2:#22d3ee; --ink:#0f172a; }

  .back-btn{
    position: fixed; left: 16px; bottom: 16px; z-index: 1100;
    background: #fff; border: 1px solid rgba(79,70,229,.35);
    border-radius: 9999px; padding: 8px 14px; cursor: pointer; color: var(--ink);
    box-shadow: 0 6px 18px rgba(79,70,229,.15);
  }

  .chip-row{
    position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
    width: min(1100px, 95vw);
    display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px; padding: 8px 10px; border-radius: 9999px;
    backdrop-filter: blur(8px) saturate(130%);
    background: linear-gradient(90deg, rgba(79,70,229,.14), rgba(34,211,238,.14));
    box-shadow: 0 8px 24px rgba(0,0,0,.12); z-index: 1050;
  }
  .chip{ width:100%; min-width:0; padding: clamp(6px,1.2vw,10px) clamp(10px,1.6vw,14px);
    font-size: clamp(12px,1.4vw,15px); border-radius: 9999px; background: #fff; border: 1.6px solid #111;
    box-shadow: 0 4px 12px rgba(0,0,0,.10); font-weight: 700; cursor: pointer; }
  .chip.active{ background:#6d5ef6; color:#fff; border-color:#6d5ef6; }

  .panel{
    position: absolute; top: 110px; bottom: 86px; left: 120px; right: 120px;
    border-radius: 24px; overflow: hidden;
    box-shadow:0 20px 60px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.28);
    backdrop-filter: blur(18px) saturate(120%);
    background:
      linear-gradient(180deg, rgba(255,255,255,.30), rgba(255,255,255,.22)),
      radial-gradient(1200px 800px at 10% 0%, rgba(79,70,229,.12), transparent 60%),
      radial-gradient(1200px 800px at 90% 20%, rgba(34,211,238,.12), transparent 60%);
  }
  canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; border-radius:24px; }

  .bottom-bar{ position: absolute; left: 12px; right: 12px; bottom: 12px;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; }
  .tag{ color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,.7); font-weight: 800; }
  .record-btn{ justify-self:center; width:58px; height:58px; background:#ef4444; border:none; border-radius:50%;
    box-shadow:0 8px 20px rgba(0,0,0,.45); cursor:pointer; }

  .status{ position:absolute; right:12px; top:12px; z-index:20;
    background: rgba(0,0,0,.45); color:#fff; font-size:12px; padding:6px 8px; border-radius:8px; }

  .antique-wrap{ position: absolute; inset: 0; display: grid; place-items: center; z-index: 30; animation: fadeIn .20s ease both; }
  @keyframes fadeIn { from{ opacity:0 } to{ opacity:1 } }
  .antique-frame{ position: relative; width: min(72vw, 820px); aspect-ratio: 4/3; transform: rotate(-0.6deg);
    background: linear-gradient(135deg, #5a3a1a, #3e2a15); border-radius: 18px;
    box-shadow: 0 24px 60px rgba(0,0,0,.35),
      inset 0 0 0 10px #6b4c2a, inset 0 0 0 18px #3d2a18, inset 0 0 0 24px #b28b45; }
  .gold-trim{ position:absolute; inset:16px; border-radius: 8px; pointer-events:none;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,.35), inset 0 0 0 6px rgba(184,134,11,.6); }
  .antique-inner{ position:absolute; inset:34px; background: #eee; border-radius: 6px; overflow: hidden;
    box-shadow: inset 0 0 40px rgba(0,0,0,.18); }
  .antique-inner img{ width:100%; height:100%; object-fit: cover; display:block; filter: contrast(1.02) saturate(1.02); }

  .card{ position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(560px, 92vw); background: rgba(255,255,255,.95);
    border: 1px solid rgba(17,17,17,.14); border-radius: 18px;
    box-shadow: 0 18px 48px rgba(0,0,0,.28); padding: 18px; text-align:center; z-index: 40; }
  .card.success { border-color: rgba(34,197,94,.35); }
  .card.warn    { border-color: rgba(234,179,8,.35); }
  .card.error   { border-color: rgba(239,68,68,.35); }
  .card .title { font-weight: 900; font-size: 1.1rem; margin-bottom: 6px; }
  .card .sub   { opacity: .85; margin-bottom: 12px; }
  .card .row   { display:flex; gap:10px; justify-content:center; }

  .btn{ border-radius: 12px; padding: 10px 16px; border: none; cursor: pointer; font-weight: 800; font-size: 14px; }
  .btn.primary{ background:#6d5ef6; color:#fff; } .btn.outline{ background:#fff; border:2px solid #111; color:#111; }
  .btn.primary:hover{ filter:brightness(1.06); } .btn.outline:hover{ background:#f6f6f6; }

  .toast{ position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    background: rgba(17,17,17,.92); color:#fff; padding:10px 14px;
    border-radius: 9999px; font-weight:700; box-shadow:0 10px 26px rgba(0,0,0,.28); z-index: 1200; }
</style>
