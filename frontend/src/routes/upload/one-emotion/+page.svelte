<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  const EMOTIONS = ['Angry','Disgust','Fear','Happy','Sad','Surprise'] as const;
  type Emotion = typeof EMOTIONS[number];

  // UI
  let currentTag: Emotion = 'Happy';
  let statusMsg = '';
  let errorMsg = '';
  let scoring = false;
  let showPassFlash = false;
  let toastMsg = '';

  // Elements
  let panelEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;
  let videoEl: HTMLVideoElement;     // created in code (not in DOM)
  let stream: MediaStream | null = null;

  // Human.js
  let human: any = null;
  let humanReady = false;

  // Tuning
  const PASS_THRESHOLD = 0.45;
  const APP_LINK = 'https://social-q-theta.vercel.app/';

  const titleCase = (s:string)=> s ? s[0].toUpperCase()+s.slice(1).toLowerCase() : s;
  const canonicalEmotion = (s:string)=>{
    const n = (s||'').toLowerCase();
    const map:Record<string,string> = {
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

  // ───────────────────────────────── Camera (same as Collage) ─────────────────────────────────
  async function ensureCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:'user', width:{ ideal:1280 }, height:{ ideal:720 } },
        audio: false
      });

      videoEl = document.createElement('video');
      videoEl.setAttribute('playsinline','');
      videoEl.setAttribute('autoplay','');
      videoEl.muted = true;
      videoEl.srcObject = stream;

      await new Promise<void>((resolve)=>{
        const to = setTimeout(resolve, 2500);
        videoEl.onloadedmetadata = ()=>{ clearTimeout(to); resolve(); };
      });
      try { await videoEl.play(); } catch {}

    } catch (e) {
      console.warn('Camera error:', e);
      statusMsg = 'Unable to access camera';
    }
  }

  // ───────────────────────────────── Human.js (same as Collage) ────────────────────────────────
  async function loadHuman() {
    if ((window as any).Human?.Human) return (window as any).Human.Human;
    await new Promise<void>((res, rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js';
      s.onload = ()=>res();
      s.onerror = rej;
      document.head.appendChild(s);
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
      face: { enabled:true, detector:{ enabled:true, maxDetected:1 }, mesh:{ enabled:true }, emotion:{ enabled:true } },
      body:false, hand:false, object:false, gesture:false
    });
    await human.load(); try { await human.warmup(); } catch {}
    humanReady = true;
    if (!scoring) statusMsg = '';
  }

  // ───────────────────────────────── Drawing (mirrored) ───────────────────────────────────────
  function sizeCanvasToPanel() {
    const r = panelEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvasEl.width  = Math.max(1, Math.floor(r.width  * dpr));
    canvasEl.height = Math.max(1, Math.floor((r.height) * dpr));
  }

  function drawToCanvas(target: HTMLCanvasElement) {
    if (!videoEl) return;
    const vw = videoEl.videoWidth || 0, vh = videoEl.videoHeight || 0;
    if (!vw || !vh) return;

    const cw = target.width, ch = target.height;
    const arC = cw / ch, arV = vw / vh;

    let sw:number, sh:number;
    if (arV > arC) { sh = vh; sw = sh*arC; } else { sw = vw; sh = sw/arC; }
    const sx = (vw - sw)/2, sy = (vh - sh)/2;

    const c = target.getContext('2d')!;
    c.clearRect(0,0,cw,ch);
    c.save();
    c.translate(cw, 0);     // mirror like selfie
    c.scale(-1, 1);
    c.drawImage(videoEl, sx, sy, sw, sh, 0, 0, cw, ch);
    c.restore();
  }

  function startLoop() {
    (function loop(){
      drawToCanvas(canvasEl);
      requestAnimationFrame(loop);
    })();
  }

  // ───────────────────────────────── Scoring (multi-frame avg) ────────────────────────────────
  async function detectEmotionAvgOn(el: HTMLCanvasElement, frames=8, gapMs=50) {
    const keys = ['angry','disgust','fear','happy','sad','surprise'] as const;
    const sum: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };

    for (let i=0; i<frames; i++) {
      drawToCanvas(el); // sample exactly what the user sees
      const det = await human.detect(el);
      const face = det?.face?.[0];
      const arr: Array<{ emotion:string; score:number }> = face?.emotion || face?.emotions || [];
      if (arr?.length) {
        const frameMax: Record<string, number> = { angry:0, disgust:0, fear:0, happy:0, sad:0, surprise:0 };
        for (const it of arr) {
          const k = canonicalEmotion(it.emotion);
          if (k in frameMax) frameMax[k] = Math.max(frameMax[k], Number(it.score ?? 0));
        }
        for (const k of keys) sum[k] += frameMax[k];
      }
      if (gapMs) await new Promise(r=>setTimeout(r,gapMs));
    }

    let total = 0; for (const k in sum) total += sum[k];
    if (!total){ for (const k in sum) sum[k]=1e-6; total=6e-6; }
    const probs: Record<string, number> = {}; for (const k of keys) probs[k]=sum[k]/total;

    const topKey = (keys as unknown as string[]).reduce((a,b)=> probs[b] > probs[a] ? b : a, keys[0] as unknown as string);
    return { probs, top:{ emotion: topKey, score: probs[topKey] } };
  }

  async function captureAndCheck() {
    if (scoring) return;
    scoring = true; errorMsg = '';

    try {
      await ensureHuman();

      const { probs, top } = await detectEmotionAvgOn(canvasEl, 8, 50);
      const want = canonicalEmotion(currentTag);
      const wantProb = probs[want] ?? 0;
      const pass = top.emotion === want || wantProb >= PASS_THRESHOLD;

      showPassFlash = pass;
      if (!pass) throw new Error(`Didn’t look like “${titleCase(currentTag)}”. Try again.`);
      setTimeout(()=> showPassFlash = false, 450);

    } catch (e:any) {
      errorMsg = e?.message || 'Check failed';
    } finally {
      scoring = false;
    }
  }

  function resetShot() {
    errorMsg = '';
    showPassFlash = false;
    // nothing else: the loop never stops and video keeps playing
  }

  function showToast(msg:string, ms=2400){
    toastMsg = msg;
    setTimeout(()=> toastMsg = '', ms);
  }

  function goBack(){ goto('/upload'); }

  // ───────────────────────────────── Lifecycle ────────────────────────────────────────────────
  onMount(async ()=>{
    await ensureCamera();
    await ensureHuman();

    sizeCanvasToPanel();
    window.addEventListener('resize', sizeCanvasToPanel);

    startLoop(); // never stops
  });

  onDestroy(()=>{
    window.removeEventListener('resize', sizeCanvasToPanel);
    try { stream?.getTracks()?.forEach(t=>t.stop()); } catch {}
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
    <button class="chip {currentTag===e?'active':''}" on:click={()=> currentTag=e} aria-pressed={currentTag===e}>{e}</button>
  {/each}
</div>

<!-- camera panel -->
<div class="panel" bind:this={panelEl}>
  <!-- hidden real video element (used only as source) -->
  <video style="position:absolute;inset:0;width:0;height:0;opacity:0;pointer-events:none;"></video>
  <canvas bind:this={canvasEl}></canvas>

  <div class="bottom-bar">
    <div class="tag">Selected emotion: {titleCase(currentTag)}</div>
    <button class="record-btn" on:click={captureAndCheck} aria-label="Capture"></button>
    <div class="right">{#if statusMsg}<span class="status">{statusMsg}</span>{/if}</div>
  </div>

  {#if showPassFlash}<div class="flash"></div>{/if}
</div>

<!-- Cards -->
{#if errorMsg}
  <div class="card warn">
    <div class="title">Not quite!</div>
    <div class="sub">{errorMsg}</div>
    <button class="btn outline" on:click={resetShot}>Try again</button>
  </div>
{/if}

{#if toastMsg}
  <div class="toast">{toastMsg}</div>
{/if}

<button class="back-btn" on:click={goBack}>← Back</button>

<style>
  @import '/style.css';
  :root{ --brand:#6d5ef6; --brand2:#22d3ee; --ink:#0f172a; }

  .chip-row{
    position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
    width: min(1100px, 95vw);
    display: grid; grid-template-columns: repeat(6, minmax(0,1fr));
    gap: 8px; padding: 8px 10px; border-radius: 9999px;
    backdrop-filter: blur(8px) saturate(130%);
    background: linear-gradient(90deg, rgba(79,70,229,.14), rgba(34,211,238,.14));
    box-shadow: 0 8px 24px rgba(0,0,0,.12); z-index: 20;
  }
  .chip{
    width: 100%; padding: clamp(6px,1.2vw,10px) clamp(10px,1.6vw,14px);
    font-size: clamp(12px,1.4vw,15px);
    border-radius: 9999px; background: #fff; border: 1.6px solid #111;
    box-shadow: 0 4px 12px rgba(0,0,0,.10); font-weight: 700; cursor: pointer;
  }
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

  .bottom-bar{
    position:absolute; left:12px; right:12px; bottom:12px;
    display:grid; grid-template-columns: 1fr auto 1fr; align-items:end; gap:8px;
  }
  .tag{ color:#fff; text-shadow:0 2px 6px rgba(0,0,0,.7); font-weight:800; }
  .right{ justify-self:end; }
  .status{ background:rgba(0,0,0,.45); color:#fff; font-size:12px; padding:6px 8px; border-radius:8px; }

  .record-btn{
    justify-self:center; width:58px; height:58px; background:#ef4444; border:none; border-radius:50%;
    box-shadow:0 8px 20px rgba(0,0,0,.45); cursor:pointer;
  }

  .flash{ position:absolute; inset:0; background:#fff; opacity:.65; animation:flash .28s ease-out forwards; pointer-events:none; }
  @keyframes flash{ to{ opacity:0 } }

  .card{
    position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(560px, 92vw); background: rgba(255,255,255,.95);
    border: 1px solid rgba(17,17,17,.14); border-radius: 18px;
    box-shadow: 0 18px 48px rgba(0,0,0,.28); padding: 18px; text-align:center; z-index: 40;
  }
  .card .title{ font-weight:900; font-size:1.1rem; margin-bottom:6px; }
  .card .sub{ opacity:.85; margin-bottom:12px; }
  .btn{ border-radius:12px; padding:10px 16px; border:2px solid #111; background:#fff; font-weight:800; cursor:pointer; }
  .btn:hover{ background:#f6f6f6; }

  .toast{
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    background: rgba(17,17,17,.92); color:#fff; padding:10px 14px;
    border-radius: 9999px; font-weight:700; box-shadow:0 10px 26px rgba(0,0,0,.28);
    z-index: 1200;
  }

  .back-btn{
    position: fixed; left:16px; bottom:16px; z-index: 25;
    background:#fff; border:1px solid rgba(79,70,229,.35);
    border-radius:9999px; padding:8px 14px; cursor:pointer; color:#0f172a;
    box-shadow:0 6px 18px rgba(79,70,229,.15);
  }
</style>
