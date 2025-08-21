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

  function choose(emotion: string, e?: MouseEvent) {
    if (e && motionOK) ripple(e);
    localStorage.setItem('train_emotion', emotion);
    // ⬇️ Go straight to the emotion training page (folder names are capitalized)
    goto(`/training/${encodeURIComponent(emotion)}`);
  }

  // click ripple
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

  // --- 3D tilt on desktop pointer ---
  let wrapEl: HTMLElement | null = null;
  let raf = 0;
  const current = { rx: 0, ry: 0 };
  const target  = { rx: 0, ry: 0 };

  function onMove(ev: MouseEvent) {
    if (!motionOK || !finePointer || !wrapEl) return;
    const r = wrapEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) / r.width;  // 0..1
    const py = (ev.clientY - r.top)  / r.height; // 0..1
    const MAX = 7; // degrees
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
</script>

<svelte:head>
  <title>Pick an Emotion • Training</title>
</svelte:head>

<!-- blobs -->
<div class="blob blob1"></div><div class="blob blob2"></div><div class="blob blob3"></div><div class="blob blob4"></div>
<div class="blob blob5"></div><div class="blob blob6"></div><div class="blob blob7"></div><div class="blob blob8"></div>
<div class="blob blob9"></div><div class="blob blob10"></div><div class="blob blob11"></div><div class="blob blob12"></div>

<div class="stage">
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
            on:click={(e)=>choose(em, e)}
          >
            {em}
            <span class="sweep" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  @import '/static/style.css';

  .stage { min-height: 100vh; display: grid; place-items: center; padding: 24px; }

  .cardWrap {
    will-change: transform;
    transition: box-shadow .2s ease;
    animation: wrapIn .5s ease both;
  }
  .cardWrap:hover { box-shadow: 0 24px 60px rgba(0,0,0,.22); }

  .card {
    width: min(920px, 94vw);
    padding: clamp(24px, 5vw, 48px);
    border-radius: 22px;
    border: 2px solid #111;             /* solid edge fits your app’s style */
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
    display: grid;
    gap: 16px;
    justify-items: stretch;
    align-items: stretch;
    margin-top: 8px;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
  }
  @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }

  .pill {
    position: relative;
    width: 100%;
    padding: 14px 18px;
    border-radius: 9999px;
    border: 2px solid #111;
    background: #fff;
    font-weight: 800;
    font-size: medium;
    cursor: pointer;
    transition: transform .12s ease, box-shadow .22s ease, background .2s ease, color .2s ease;
    will-change: transform, box-shadow;
    opacity: 0;
    transform: translateY(8px) scale(.96);
    animation: pillIn .44s ease forwards;
    animation-delay: var(--stagger, 0ms);
  }
  .pill:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 12px 28px rgba(79,70,229,.28);
    background: #4f46e5; color: #fff;
  }

  .pill .sweep {
    position: absolute; inset: 0;
    border-radius: inherit;
    background:
      linear-gradient(115deg, transparent 0 45%,
        rgba(255,255,255,.45) 50%,
        transparent 55% 100%);
    transform: translateX(-120%);
    opacity: 0;
    pointer-events: none;
  }
  .pill:hover .sweep { animation: sweep 650ms ease-out forwards; }

  .rip {
    position: absolute; border-radius: 50%; pointer-events: none;
    background: currentColor; opacity: .25; transform: scale(0);
    animation: ripple .5s ease-out forwards; mix-blend-mode: multiply;
  }

  @keyframes wrapIn   { from { opacity:0; transform: translateY(10px) scale(.98) } to { opacity:1; transform:none } }
  @keyframes titlePop { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform:none } }
  @keyframes pillIn   { to   { opacity:1; transform: translateY(0) scale(1) } }
  @keyframes sweep    { to   { transform: translateX(140%); opacity: 1 } }
  @keyframes ripple   { to   { transform: scale(2.6); opacity: 0 } }

  @media (prefers-reduced-motion: reduce) {
    .cardWrap, .card, .title, .pill, .pill .sweep { animation: none !important; }
  }
</style>
