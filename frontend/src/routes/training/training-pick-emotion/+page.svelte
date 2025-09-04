<script lang="ts">
  import { goto } from '$app/navigation';

  const EMOTIONS = ['Anger','Disgust','Fear','Happiness','Sadness','Surprise'];

  // motion + pointer capability
  let motionOK = true;
  let finePointer = true;
  if (typeof window !== 'undefined') {
    motionOK    = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    finePointer = matchMedia('(pointer: fine)').matches;
  }
  finePointer = true; // force tilt on desktop

  // ---------------- contextual popover state ----------------
  let chooserOpen = false;
  let picked: string | null = null;

  // viewport-anchored coordinates for the popover (centered on the pill)
  let menuX = 0; // px
  let menuY = 0; // px

  function openChooser(emotion: string, e?: MouseEvent) {
    if (e && motionOK) ripple(e);

    const el = e?.currentTarget as HTMLElement | undefined;
    if (el) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top  + r.height / 2;

      // clamp a bit so chips don’t get cut off at extreme edges
      const PADX = 140; // half row ≈ 260–280px total
      const PADY = 60;  // button height buffer
      menuX = Math.min(Math.max(cx, PADX), window.innerWidth  - PADX);
      menuY = Math.min(Math.max(cy, PADY), window.innerHeight - PADY);
    }

    picked = emotion;
    chooserOpen = true;

    queueMicrotask(() => {
      (document.querySelector('.menu .opt.primary') as HTMLButtonElement)?.focus();
    });
  }

  function closeChooser() {
    chooserOpen = false;
    picked = null;
  }

  function goTraining() {
    if (!picked) return;
    localStorage.setItem('train_emotion', picked);
    goto(`/training/${encodeURIComponent(picked)}?coach=true`);
  }
  function goFacts() {
    if (!picked) return;
    localStorage.setItem('train_emotion', picked);
    goto(`/training/facts/${encodeURIComponent(picked)}`);
  }

  // ripple (unchanged)
  function ripple(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el) return;
    el.style.position ||= 'relative';
    el.style.overflow = 'hidden';
    el.querySelector('.rip')?.remove();

    const rect = el.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const s = document.createElement('span');
    s.className = 'rip';
    s.style.width = s.style.height = `${d}px`;
    s.style.left = `${(e.clientX ?? 0) - rect.left - d / 2}px`;
    s.style.top  = `${(e.clientY ?? 0) - rect.top  - d / 2}px`;
    el.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }

  // --- 3D tilt (unchanged) ---
  let wrapEl: HTMLElement | null = null;
  let raf = 0;
  const current = { rx: 0, ry: 0 };
  const target  = { rx: 0, ry: 0 };

  function onMove(ev: MouseEvent) {
    if (!motionOK || !finePointer || !wrapEl) return;
    const r = wrapEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;
    const py = (ev.clientY - r.top)  / r.height;
    const MAX = 7;
    target.ry = (px - 0.5) * 2 * MAX;
    target.rx = -(py - 0.5) * 2 * MAX;
    startTilt();
  }
  function onLeave() { target.rx = 0; target.ry = 0; startTilt(); }
  function startTilt() {
    if (raf) return;
    const step = () => {
      const k = 0.12;
      current.rx += (target.rx - current.rx) * k;
      current.ry += (target.ry - current.ry) * k;
      if (wrapEl) {
        wrapEl.style.transform =
          `perspective(900px) rotateX(${current.rx}deg) rotateY(${current.ry}deg) translateZ(0)`;
      }
      const done = Math.abs(current.rx - target.rx) < 0.06 && Math.abs(current.ry - target.ry) < 0.06;
      raf = done ? 0 : requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // close with ESC
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && chooserOpen) {
        e.preventDefault();
        closeChooser();
      }
    });
  }
</script>

<svelte:head>
  <title>Pick an Emotion • Training</title>
</svelte:head>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage full-viewport safe-area">
  <div
    class="cardWrap"
    bind:this={wrapEl}
    on:mousemove={onMove}
    on:mouseenter={onMove}
    on:mouseleave={onLeave}
  >
    <div class="card">
      <h1 class="title">Pick an Emotion</h1>

      <div class="grid">
        {#each EMOTIONS as em, i}
          <button
            class="pill"
            style="--stagger:{i * 60}ms"
            on:click={(e)=>openChooser(em, e)}
            aria-haspopup="true"
          >
            {em}
            <span class="sweep" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

{#if chooserOpen}
  <!-- Backdrop (click-away to cancel) -->
  <div
    class="overlay"
    on:click={(e)=>{ if (e.target === e.currentTarget) closeChooser(); }}
  >
    <!-- Transparent, centered on the clicked pill -->
    <div
      class="menu bare center"
      style={`--x:${menuX}px; --y:${menuY}px`}
      role="dialog" aria-modal="true" aria-label="Choose destination"
    >
      <div class="menu-row">
        <button class="opt primary" on:click={goTraining} style="--d:0ms">Training</button>
        <button class="opt" on:click={goFacts} style="--d:60ms">Facts</button>
      </div>
    </div>
  </div>
{/if}

<style>
  @import '/static/style.css';

  .stage { min-height: 100vh; display: grid; place-items: center; padding: 24px; }

  .cardWrap { will-change: transform; transition: box-shadow .2s ease; animation: wrapIn .5s ease both; }
  .cardWrap:hover { box-shadow: 0 24px 60px rgba(0,0,0,.22); }

  .card {
    width: min(920px, 94vw);
    padding: clamp(24px, 5vw, 48px);
    border-radius: 22px;
    border: 2px solid #111;
    background: rgba(255,255,255,.22);
    backdrop-filter: blur(18px);
    box-shadow: 0 16px 48px rgba(0,0,0,.18);
    text-align: center;
  }

  .title {
    font-family: Georgia, serif;
    font-size: clamp(28px, 4.6vw, 44px);
    margin: 0 0 16px;
    color: #fff;
    -webkit-text-stroke: 2px rgba(0,0,0,.45);
    text-shadow: 0 3px 8px rgba(0,0,0,.35);
    animation: titlePop .45s ease both .05s;
  }

  .grid {
    display: grid; gap: 16px; justify-items: stretch; align-items: stretch; margin-top: 8px;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
  }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }

  .pill {
    position: relative; width: 100%; padding: 14px 18px; border-radius: 9999px;
    border: 2px solid #111; background: #fff; font-weight: 800; font-size: medium; cursor: pointer;
    transition: transform .12s ease, box-shadow .22s ease, background .2s ease, color .2s ease;
    will-change: transform, box-shadow;
    opacity: 0; transform: translateY(8px) scale(.96); animation: pillIn .44s ease forwards;
    animation-delay: var(--stagger, 0ms);
  }
  .pill:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 12px 28px rgba(79,70,229,.28); background: #4f46e5; color: #fff; }
  .pill .sweep {
    position: absolute; inset: 0; border-radius: inherit;
    background: linear-gradient(115deg, transparent 0 45%, rgba(255,255,255,.45) 50%, transparent 55% 100%);
    transform: translateX(-120%); opacity: 0; pointer-events: none;
  }
  .pill:hover .sweep { animation: sweep 650ms ease-out forwards; }

  .rip { position: absolute; border-radius: 50%; pointer-events: none; background: currentColor; opacity: .25; transform: scale(0);
         animation: ripple .5s ease-out forwards; mix-blend-mode: multiply; }

  /* -------------------- POP-OUT MENU (bare, centered) -------------------- */

  .overlay{
    position: fixed; inset: 0; z-index: 1000;
    background: radial-gradient(80% 60% at 50% 50%, rgba(255,255,255,.16), rgba(255,255,255,.08)), rgba(0,0,0,.18);
    backdrop-filter: blur(2px);
  }

  .menu { position: fixed; left: var(--x); top: var(--y); pointer-events: none; }
  .menu.bare.center {
    transform-origin: 50% 50%;
    animation: popAt .16s ease-out both;
  }

  .menu-row{
    display:flex; gap:10px; justify-content:center; pointer-events: auto;
    /* center exactly on the clicked spot */
    transform: translate(-50%, -50%);
  }

  .opt{
    background:#fff; border:2px solid #111; border-radius:9999px;
    padding:8px 14px; font-weight:900; cursor:pointer;
    box-shadow:0 10px 20px rgba(0,0,0,.12);
    transition: transform .12s ease, box-shadow .2s ease, background .2s ease, color .2s ease, opacity .2s ease;
    animation: chipIn .22s ease both; animation-delay: var(--d, 0ms);
  }
  .opt:hover{ transform: translateY(-1px); box-shadow:0 16px 28px rgba(0,0,0,.18); }
  .opt.primary{ background:#4f46e5; color:#fff; }

  @keyframes popAt   { from { opacity:0; } to { opacity:1; } }
  @keyframes chipIn  { from { opacity:0; transform: translateY(6px) scale(.96) } to { opacity:1; transform:none } }

  /* Motion-reduced safety */
  @media (prefers-reduced-motion: reduce) {
    .menu.bare.center, .opt { animation: none !important; }
  }

  /* ---- originals ---- */
  @keyframes wrapIn   { from { opacity:0; transform: translateY(10px) scale(.98) } to { opacity:1; transform:none } }
  @keyframes titlePop { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform:none } }
  @keyframes pillIn   { to   { opacity:1; transform: translateY(0) scale(1) } }
  @keyframes sweep    { to   { transform: translateX(140%); opacity: 1 } }
  @keyframes ripple   { to   { transform: scale(2.6); opacity: 0 } }
</style>
